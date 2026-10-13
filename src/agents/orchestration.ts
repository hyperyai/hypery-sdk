// The tools a parent agent uses to run its agents (Claude Code's Agent / SendMessage / TaskStop / ListAgents, dune's
// task / await_job), bound to an AgentRuntime. A host adds them to its own tool list; `execOrchestrationTool` runs
// one. Parent-only: a child never gets them.

import type { LoopTool } from './loop.js'
import type { AgentRuntime } from './runtime.js'
import type { ToolCall, ToolRun } from './types.js'

export const ORCHESTRATION_TOOLS = ['task', 'send_message', 'stop_agent', 'list_agents', 'await_agent'] as const

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): LoopTool['spec'] =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } })

/** Specs for the parent's orchestration tools. `profiles` lists the agent types the model can choose from. */
export function orchestrationTools(runtime: AgentRuntime, profiles: { id: string; description: string }[]): LoopTool[] {
  const types = profiles.map(p => `- ${p.id}: ${p.description}`).join('\n')
  return [
    {
      readOnly: true, // independent of the other calls in a round: several start together
      acts: false,
      spec: fn('task', [
        'Start an agent to do a self-contained piece of work with its own fresh context; only its answer comes back. Use agents to keep your own context small and to work in parallel: several task calls in one message run at once.',
        'The agent cannot see this conversation: put everything it needs in the prompt (scope, goal, constraints, what to report).',
        'Background agents return an id at once and report back as a notification; foreground ones return their answer. Every agent has an id you can send_message to (to steer it while it runs, or to continue it later with its context), stop_agent, or check with await_agent.',
        `Agent types:\n${types}`,
      ].join('\n\n'), {
        subagent_type: { type: 'string', description: 'One of the agent types above.' },
        prompt: { type: 'string', description: 'The self-contained task.' },
        description: { type: 'string', description: 'A short label, e.g. "Review the pricing page".' },
        run_in_background: { type: 'boolean', description: 'Return its id now and keep working; its answer arrives as a notification.' },
        readonly: { type: 'boolean', description: 'Read-only tools only, whatever the type allows.' },
      }, ['subagent_type', 'prompt']),
    },
    {
      readOnly: true, acts: false,
      spec: fn('send_message', 'Message an agent by id. A running agent reads it at its next step (steer it, answer its question). A finished one is resumed with its whole context and this message; set wait to get its answer now, otherwise it arrives as a notification.', {
        agent_id: { type: 'string' },
        message: { type: 'string' },
        wait: { type: 'boolean', description: 'Resume a finished agent and wait for its answer.' },
      }, ['agent_id', 'message']),
    },
    { readOnly: true, acts: false, spec: fn('stop_agent', 'Stop one running agent by id.', { agent_id: { type: 'string' } }, ['agent_id']) },
    { readOnly: true, acts: false, spec: fn('list_agents', 'List your agents with their status and last answer.', {}) },
    {
      readOnly: true, acts: false,
      spec: fn('await_agent', 'Wait for an agent by id to finish and get its answer (or its status when the wait times out). Use it when you need the answer before you can go on; otherwise keep working and let it notify you.', {
        agent_id: { type: 'string' },
        timeout_seconds: { type: 'number', description: 'How long to wait at most (default 120, at most 600).' },
      }, ['agent_id']),
    },
  ]
}

export const isOrchestrationTool = (name: string) => (ORCHESTRATION_TOOLS as readonly string[]).includes(name)

const result = (call: ToolCall, summary: string, data: unknown, ok = true): ToolRun => ({ ...call, ok, summary, content: JSON.stringify(data) })

/** Run one orchestration tool call against `runtime`. `signal` is the parent turn's (its Stop stops foreground agents). */
export async function execOrchestrationTool(runtime: AgentRuntime, call: ToolCall, opts: { signal?: AbortSignal; readOnly?: boolean } = {}): Promise<ToolRun> {
  let args: Record<string, unknown> = {}
  try { args = JSON.parse(call.argsText || '{}') } catch { return result(call, 'invalid arguments', { error: 'Arguments are not valid JSON.' }, false) }
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '')
  switch (call.name) {
    case 'task': {
      const r = await runtime.spawn({
        profileId: str('subagent_type'), prompt: str('prompt'), description: str('description') || undefined,
        background: args.run_in_background === true, readOnly: opts.readOnly === true || args.readonly === true, signal: opts.signal,
      })
      if (r.kind === 'refused') return result(call, 'refused', { error: r.reason }, false)
      // Handing work to an agent that can make changes is acting: the parent shouldn't be nudged to redo it.
      const acted = runtime.get(r.id)?.readOnly === false
      if (r.kind === 'started') return { ...result(call, `${str('subagent_type')} started (${r.id})`, { agent_id: r.id, status: 'running', note: 'Keep working: its answer arrives as a notification.' }), acted }
      return { ...result(call, `${str('subagent_type')}: ${r.ok ? 'done' : 'failed'}`, { agent_id: r.id, ok: r.ok, rounds: r.rounds, answer: r.summary }, r.ok), acted }
    }
    case 'send_message': {
      const r = await runtime.message(str('agent_id'), str('message'), { wait: args.wait === true, signal: opts.signal })
      if (r.kind === 'unknown') return result(call, 'unknown agent', { error: `No agent "${str('agent_id')}".` }, false)
      const acted = runtime.get(r.id)?.readOnly === false
      if (r.kind === 'queued') return { ...result(call, 'delivered', { agent_id: r.id, status: 'running', note: 'It reads this at its next step.' }), acted }
      if (r.kind === 'resumed') return { ...result(call, 'resumed', { agent_id: r.id, status: 'running', note: 'Its answer arrives as a notification.' }), acted }
      return { ...result(call, r.ok ? 'answered' : 'failed', { agent_id: r.id, ok: r.ok, answer: r.summary }), acted }
    }
    case 'stop_agent': {
      const stopped = runtime.stop(str('agent_id'))
      return result(call, stopped ? 'stopped' : 'not running', { agent_id: str('agent_id'), stopped })
    }
    case 'list_agents': {
      const rows = runtime.list().map(s => ({ agent_id: s.id, type: s.profile, description: s.description, status: s.status, answer: s.summary }))
      return result(call, `${rows.length} agent${rows.length === 1 ? '' : 's'}`, { agents: rows })
    }
    case 'await_agent': {
      const seconds = typeof args.timeout_seconds === 'number' ? Math.min(Math.max(args.timeout_seconds, 1), 600) : 120
      const s = await runtime.wait(str('agent_id'), { timeoutMs: seconds * 1000, signal: opts.signal })
      if (!s) return result(call, 'unknown agent', { error: `No agent "${str('agent_id')}".` }, false)
      const busy = s.status === 'running' || s.status === 'queued'
      if (!busy) runtime.dismissFinished(s.id)
      return result(call, `${s.id}: ${s.status}`, { agent_id: s.id, status: s.status, answer: s.summary, ...(busy ? { note: `Still ${s.status} after ${seconds}s. Carry on; it notifies you when it finishes.` } : {}) })
    }
    default:
      return result(call, 'unknown tool', { error: `${call.name} is not an orchestration tool.` }, false)
  }
}
