import { describe, expect, it } from 'bun:test'
import { runAgentLoop, type LoopTool } from '../loop.js'
import { AgentRuntime, REPORT_TOOL, type AgentHost, type AgentSession } from '../runtime.js'
import { execOrchestrationTool, orchestrationTools } from '../orchestration.js'
import { BUILTIN_PROFILES } from '../profiles.js'
import type { CallModel, ChatMessage, ModelTurn } from '../types.js'

const tool = (name: string, readOnly: boolean): LoopTool => ({ readOnly, spec: { type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } } })
const turn = (text: string, calls: [string, object?][] = []): ModelTurn => ({ text, toolCalls: calls.map(([name, args], i) => ({ id: `${name}-${i}-${Math.random()}`, name, arguments: JSON.stringify(args ?? {}) })) })
/** A model that plays back turns in order. */
const scripted = (turns: ModelTurn[], seen: ChatMessage[][] = []): CallModel => async msgs => { seen.push([...msgs]); return turns.shift() ?? turn('done') }
const lastUser = (msgs: ChatMessage[]) => [...msgs].reverse().find(m => m.role === 'user')?.content

describe('runAgentLoop', () => {
  it('nudges a turn that was asked to act and only read, then ends once it acts', async () => {
    const seen: ChatMessage[][] = []
    const out = await runAgentLoop({
      messages: [{ role: 'user', content: 'make it red' }],
      tools: [tool('read', true), tool('edit', false)],
      callModel: scripted([turn('', [['read']]), turn('Looks fine.'), turn('', [['edit']]), turn('Made it red.')], seen),
      execTool: async c => ({ ...c, ok: true, summary: 'ok', content: '{}' }),
      requireAction: true,
    })
    expect(out.acted).toBe(true)
    expect(out.text).toBe('Made it red.')
    expect(String(lastUser(seen[2]))).toContain('You have not changed anything yet')
  })

  it('retries a recoverable model failure', async () => {
    let calls = 0
    const out = await runAgentLoop({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      callModel: async () => { if (calls++ === 0) throw new Error('stream stalled'); return turn('hello') },
      execTool: async c => ({ ...c, ok: true, summary: '', content: '' }),
    })
    expect(out.text).toBe('hello')
  })

  it('continues when a notification arrives as the model stops', async () => {
    const queue = ['', 'Agent x finished: done']
    const out = await runAgentLoop({
      messages: [{ role: 'user', content: 'go' }],
      tools: [],
      callModel: scripted([turn('waiting'), turn('All done.')]),
      execTool: async c => ({ ...c, ok: true, summary: '', content: '' }),
      drainNotifications: () => { const n = queue.shift(); return n ? [n] : [] },
    })
    expect(out.text).toBe('All done.')
  })
})

function host(turnsFor: (prompt: string) => ModelTurn[], store?: Map<string, AgentSession>): AgentHost & { events: string[] } {
  const scripts = new Map<string, ModelTurn[]>()
  const events: string[] = []
  return {
    events,
    profiles: () => BUILTIN_PROFILES,
    callModel: async msgs => {
      const task = String(msgs.find(m => m.role === 'user')?.content ?? '')
      if (!scripts.has(task)) scripts.set(task, turnsFor(task))
      return scripts.get(task)!.shift() ?? turn(`answer to ${task}`)
    },
    childTools: ctx => (ctx.readOnly ? [tool('read', true)] : [tool('read', true), tool('edit', false)]),
    execChildTool: async c => { events.push(c.name); return { ...c, ok: true, summary: 'ok', content: '{}' } },
    childSystemPrompt: ctx => ctx.profile.instructions,
    store: store ? { load: async () => [...store.values()], save: async s => { store.set(s.id, structuredClone(s)) } } : undefined,
  }
}

describe('AgentRuntime', () => {
  it('runs a foreground agent and keeps it resumable with its context', async () => {
    const rt = new AgentRuntime(host(() => [turn('', [['edit']]), turn('built it')]))
    const r = await rt.spawn({ profileId: 'builder', prompt: 'build a card' })
    expect(r).toMatchObject({ kind: 'done', ok: true, summary: 'built it' })
    const id = (r as { id: string }).id
    const again = await rt.message(id, 'now make it blue', { wait: true })
    expect(again.kind).toBe('done')
    const transcript = rt.get(id)!.transcript
    expect(transcript.some(m => m.role === 'user' && String(m.content).includes('build a card'))).toBe(true)
    expect(transcript.some(m => m.role === 'user' && String(m.content).includes('now make it blue'))).toBe(true)
  })

  it('delivers a message to a running background agent at its next round, and its answer to the parent', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const seen: ChatMessage[][] = []
    const h = host(() => [])
    let n = 0
    h.callModel = async msgs => {
      seen.push([...msgs])
      if (n++ === 0) { await gate; return turn('', [['read']]) }
      return turn('finished with the message')
    }
    const rt = new AgentRuntime(h)
    const r = await rt.spawn({ profileId: 'explorer', prompt: 'look around', background: true })
    expect(r.kind).toBe('started')
    const id = (r as { id: string }).id
    expect((await rt.message(id, 'focus on the header')).kind).toBe('queued')
    release()
    while (rt.get(id)!.status === 'running') await new Promise(res => setTimeout(res, 1))
    expect(String(lastUser(seen[1]))).toContain('focus on the header')
    const notes = rt.drainParentNotifications()
    expect(notes.join('\n')).toContain('finished with the message')
  })

  it('stops one agent and routes a child report to the parent', async () => {
    const h = host(() => [])
    let resolveTurn!: (t: ModelTurn) => void
    let calls = 0
    h.callModel = async (_m, _t, _h, signal) => {
      if (calls++ === 0) return turn('', [[REPORT_TOOL, { message: 'Halfway there' }]])
      return new Promise<ModelTurn>((res, rej) => { resolveTurn = res; signal?.addEventListener('abort', () => rej(new Error('aborted'))) })
    }
    const rt = new AgentRuntime(h)
    const r = await rt.spawn({ profileId: 'builder', prompt: 'long job', background: true })
    const id = (r as { id: string }).id
    while (!rt.hasPendingNotifications()) await new Promise(res => setTimeout(res, 1))
    expect(rt.drainParentNotifications()[0]).toContain('Halfway there')
    expect(rt.stop(id)).toBe(true)
    expect(rt.get(id)!.status).toBe('stopped')
    void resolveTurn
  })

  it('keeps sessions in the store and marks a run cut off by a reload as stopped', async () => {
    const store = new Map<string, AgentSession>()
    const rt = new AgentRuntime(host(() => [turn('first answer')], store))
    const r = await rt.spawn({ profileId: 'planner', prompt: 'plan it' })
    await new Promise(res => setTimeout(res, 1))
    const id = (r as { id: string }).id
    store.set('cut', { ...store.get(id)!, id: 'cut', status: 'running' })
    const reloaded = new AgentRuntime(host(() => [turn('continued')], store))
    await reloaded.load()
    expect(reloaded.get(id)!.summary).toBe('first answer')
    expect(reloaded.get('cut')!.status).toBe('stopped')
    const res = await reloaded.message(id, 'refine step 2', { wait: true })
    expect(res.kind).toBe('done')
  })

  it('refuses an unknown agent type and an empty prompt', async () => {
    const rt = new AgentRuntime(host(() => []))
    expect((await rt.spawn({ profileId: 'nope', prompt: 'x' })).kind).toBe('refused')
    expect((await rt.spawn({ profileId: 'builder', prompt: '  ' })).kind).toBe('refused')
  })
})

describe('orchestration tools', () => {
  it('exposes the parent tools and runs task / list_agents / await_agent / stop_agent / send_message', async () => {
    const rt = new AgentRuntime(host(() => [turn('reviewed: PASS')]))
    const specs = orchestrationTools(rt, BUILTIN_PROFILES).map(t => t.spec.function.name)
    expect(specs).toEqual(['task', 'send_message', 'stop_agent', 'list_agents', 'await_agent'])
    const call = (name: string, args: object) => execOrchestrationTool(rt, { id: name, name, argsText: JSON.stringify(args) })
    const t = JSON.parse((await call('task', { subagent_type: 'reviewer', prompt: 'check the card' })).content)
    expect(t.answer).toBe('reviewed: PASS')
    const list = JSON.parse((await call('list_agents', {})).content)
    expect(list.agents[0]).toMatchObject({ type: 'reviewer', status: 'done' })
    expect(JSON.parse((await call('await_agent', { agent_id: t.agent_id })).content).status).toBe('done')
    expect(JSON.parse((await call('stop_agent', { agent_id: t.agent_id })).content).stopped).toBe(false)
    expect((await call('send_message', { agent_id: 'missing', message: 'hi' })).ok).toBe(false)
  })
})

describe('delegation', () => {
  it('await_agent waits for a background agent and takes its answer instead of a later notification', async () => {
    let finish!: () => void
    const gate = new Promise<void>(r => { finish = r })
    const h = host(() => [turn('found it')])
    const model = h.callModel
    h.callModel = async (...a) => { await gate; return model(...a) }
    const rt = new AgentRuntime(h)
    const call = (name: string, args: object) => execOrchestrationTool(rt, { id: name, name, argsText: JSON.stringify(args) })
    const t = JSON.parse((await call('task', { subagent_type: 'explorer', prompt: 'look', run_in_background: true })).content)
    const waited = call('await_agent', { agent_id: t.agent_id })
    setTimeout(finish, 20)
    const r = JSON.parse((await waited).content)
    expect(r).toMatchObject({ status: 'done', answer: 'found it' })
    expect(rt.drainParentNotifications()).toEqual([])
    expect(JSON.parse((await call('await_agent', { agent_id: t.agent_id, timeout_seconds: 1 })).content).status).toBe('done')
  })

  it('times out with the status when the agent is still running', async () => {
    const h = host(() => [])
    h.callModel = () => new Promise(() => {})
    const rt = new AgentRuntime(h)
    const call = (name: string, args: object) => execOrchestrationTool(rt, { id: name, name, argsText: JSON.stringify(args) })
    const t = JSON.parse((await call('task', { subagent_type: 'builder', prompt: 'work', run_in_background: true })).content)
    const r = JSON.parse((await call('await_agent', { agent_id: t.agent_id, timeout_seconds: 1 })).content)
    expect(r.status).toBe('running')
    rt.stopAll()
  })

  it('handing work to a builder counts as acting, so requireAction does not nudge the parent to redo it', async () => {
    const rt = new AgentRuntime(host(() => [turn('', [['edit']]), turn('built it')]))
    const parent = scripted([turn('', [['task', { subagent_type: 'builder', prompt: 'make it red' }]]), turn('The builder made it red.')])
    const seen: string[] = []
    const out = await runAgentLoop({
      callModel: async (m, ...rest) => { seen.push(String(m[m.length - 1].content)); return parent(m, ...rest) },
      tools: [tool('edit', false), ...orchestrationTools(rt, BUILTIN_PROFILES)],
      messages: [{ role: 'user', content: 'make it red' }],
      requireAction: true,
      execTool: c => execOrchestrationTool(rt, c),
    })
    expect(out.acted).toBe(true)
    expect(out.text).toBe('The builder made it red.')
    expect(seen.some(s => s.includes('You have not changed anything'))).toBe(false)
  })

  it('handing work to a read-only explorer does not count as acting', async () => {
    const rt = new AgentRuntime(host(() => [turn('it is blue')]))
    const parent = scripted([turn('', [['task', { subagent_type: 'explorer', prompt: 'what colour' }]]), turn('It is blue.'), turn('', [['edit']]), turn('Made it red.')])
    const out = await runAgentLoop({
      callModel: parent,
      tools: [tool('edit', false), ...orchestrationTools(rt, BUILTIN_PROFILES)],
      messages: [{ role: 'user', content: 'make it red' }],
      requireAction: true,
      execTool: async c => (c.name === 'edit' ? { ...c, ok: true, summary: 'ok', content: '{}' } : execOrchestrationTool(rt, c)),
    })
    expect(out.acted).toBe(true)
    expect(out.text).toBe('Made it red.')
  })
})
