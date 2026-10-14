// A main agent with agents it can talk to: explorer and builder agents, messages both ways, the plan, events.
//   bun examples/agents/orchestrator.ts

import {
  createAgentRuntime, createTodoList, BUILTIN_PROFILES, ORCHESTRATOR_GUIDANCE, TODO_TOOL, execOrchestrationTool, isOrchestrationTool,
  orchestrationTools, runAgentLoop, todoTool, type CallModel, type ChatMessage,
} from '../../src/agents'
import { doc, docTools, log, model, online, runDocTool } from './setup'

const profiles = BUILTIN_PROFILES
const runtime = createAgentRuntime({
  callModel: model,
  profiles: () => profiles,
  // Children get the document tools; read-only types only the reading one.
  childTools: ctx => (ctx.readOnly ? docTools.filter(t => t.readOnly) : docTools),
  execChildTool: call => runDocTool(call),
  childSystemPrompt: ctx => `${ctx.profile.instructions}\n\nYou work on a small document through your tools.`,
  onEvent: e => {
    if (e.type === 'session') log(`  [${e.sessionId}] ${e.profile}: ${e.status}`)
    if (e.type === 'tool-start') log(`  [${e.sessionId}] → ${e.name}`)
    if (e.type === 'report') log(`  [${e.sessionId}] ${e.question ? 'asks' : 'reports'}: ${e.message}`)
  },
})
const todos = createTodoList([], t => log(`  plan: ${t.map(x => `${x.status === 'done' ? '✓' : '·'} ${x.text}`).join('  ')}`))

// Offline, the main agent follows a fixed script: plan, explore and build in parallel, wait for the builder's
// notification, mark the plan done, answer. With HYPERY_TOKEN set, the real model decides.
let step = 0
let marked = false
const scriptedParent: CallModel = async (messages: ChatMessage[]) => {
  const c = (name: string, args: object) => ({ id: `p${step}_${name}`, name, arguments: JSON.stringify(args) })
  step++
  if (step === 1) return { text: '', toolCalls: [c(TODO_TOOL, { replace: [{ text: 'Look at the document' }, { text: 'Write the body' }] })] }
  if (step === 2) return { text: '', toolCalls: [
    c('task', { subagent_type: 'explorer', prompt: 'Report what the document contains.', description: 'Look' }),
    c('task', { subagent_type: 'builder', prompt: 'Write a one-line body for the document that mentions "pop".', description: 'Write', run_in_background: true }),
  ] }
  if (step === 3) return { text: '', toolCalls: [c(TODO_TOOL, { update: [{ id: '1', status: 'done' }] })] }
  const builderDone = messages.some(m => m.role === 'user' && /Agent .* \(builder\) finished/.test(String(m.content)))
  if (!builderDone) {
    // Still building: wait a moment (a real model would carry on with other work), then look again.
    await new Promise(r => setTimeout(r, 20))
    return { text: '', toolCalls: [c('list_agents', {})] }
  }
  if (!marked) { marked = true; return { text: '', toolCalls: [c(TODO_TOOL, { update: [{ id: '2', status: 'done' }] })] } }
  return { text: 'Done: the explorer looked, the builder wrote the body.', toolCalls: [] }
}
const parentModel: CallModel = online ? model : scriptedParent

const outcome = await runAgentLoop({
  messages: [
    { role: 'system', content: `You manage a small document.\n\n${ORCHESTRATOR_GUIDANCE}` },
    { role: 'user', content: 'Give the document a one-line body that mentions "pop", and check it.' },
  ],
  tools: [...docTools, todoTool, ...orchestrationTools(runtime, profiles)],
  callModel: parentModel,
  execTool: async call => {
    if (call.name === TODO_TOOL) return todos.run(call)
    if (isOrchestrationTool(call.name)) return execOrchestrationTool(runtime, call)
    return runDocTool(call)
  },
  // Finished background agents and their reports reach the main agent between its steps.
  drainNotifications: () => runtime.drainParentNotifications(),
  maxRounds: 12,
})

// A background agent may still be finishing: wait for it, as a UI would keep listening.
while (runtime.list().some(s => s.status === 'running' || s.status === 'queued')) await new Promise(r => setTimeout(r, 10))
log(`\n${outcome.text}`)
log('Document:', Object.fromEntries(doc))
log('Agents:', runtime.list().map(s => `${s.id} ${s.profile} ${s.status}`))
