import { describe, expect, it } from 'bun:test'
import { createAgentRuntime, createHyperyModel, execOrchestrationTool, forceTool, runAgentLoop, type AgentProfile, type CallModel, type LoopTool, type ModelRequest, type ModelTurn } from '../index.js'

const tool = (name: string): LoopTool => ({ readOnly: true, spec: { type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } } })
const turn = (text: string, calls: string[] = []): ModelTurn => ({ text, toolCalls: calls.map((name, i) => ({ id: `${name}-${i}`, name, arguments: '{}' })) })
const sse = () => new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }) + '\n\ndata: [DONE]\n\n', { status: 200 })

describe('tool_choice', () => {
  it('createHyperyModel sends the request\'s tool choice, "auto" by default', async () => {
    const bodies: any[] = []
    const model = createHyperyModel({ token: 't', model: 'm', fetch: (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return sse() }) as unknown as typeof fetch })
    const msgs = [{ role: 'user' as const, content: 'hi' }]
    await model(msgs, [tool('plan').spec], {})
    await model(msgs, [tool('plan').spec], {}, null, { toolChoice: forceTool('plan') })
    await model(msgs, [tool('plan').spec], {}, null, { toolChoice: 'required' })
    await model(msgs, [], {}, null, { toolChoice: 'required' })
    expect(bodies.map(b => b.tool_choice)).toEqual(['auto', { type: 'function', function: { name: 'plan' } }, 'required', undefined])
  })

  it('runAgentLoop applies a fixed or per-round tool choice, and none on the wrap-up call', async () => {
    const seen: (ModelRequest | undefined)[] = []
    const model: CallModel = async (msgs, _tools, _h, _s, req) => {
      seen.push(req ?? undefined)
      return msgs.some(m => m.role === 'tool') ? turn('done') : turn('', ['plan'])
    }
    const execTool = async (c: any) => ({ id: c.id, name: c.name, argsText: c.argsText, ok: true, summary: 'ok', content: '{}' })
    await runAgentLoop({ messages: [{ role: 'user', content: 'go' }], tools: [tool('plan')], callModel: model, execTool, toolChoice: (r: number) => r === 0 ? forceTool('plan') : null })
    expect(seen).toEqual([{ toolChoice: { type: 'function', function: { name: 'plan' } } }, undefined])
    seen.length = 0
    await runAgentLoop({ messages: [{ role: 'user', content: 'go' }], tools: [tool('plan')], callModel: model, execTool, toolChoice: 'required', maxRounds: 1 })
    expect(seen).toEqual([{ toolChoice: 'required' }, undefined])
  })
})

const profiles: AgentProfile[] = [
  { id: 'bg', description: 'bg', instructions: 'You are bg.', tools: ['*'], readOnly: true, background: true },
  { id: 'fg', description: 'fg', instructions: 'You are fg.', tools: ['*'], readOnly: true },
]

describe('runtime', () => {
  it('awaits an async childSystemPrompt', async () => {
    let system = ''
    const rt = createAgentRuntime({
      callModel: async msgs => { system = String(msgs[0].content); return turn('ok') },
      profiles: () => profiles, childTools: () => [], execChildTool: async () => { throw new Error('none') },
      childSystemPrompt: async ctx => { await new Promise(r => setTimeout(r, 5)); return ctx.profile.instructions + ' (async)' },
    })
    const r = await rt.spawn({ profileId: 'fg', prompt: 'hi' })
    expect(r.ok).toBe(true)
    expect(system).toBe('You are fg. (async)')
  })

  it('the task tool leaves background to the profile unless the call sets it', async () => {
    const rt = createAgentRuntime({ callModel: async () => turn('ok'), profiles: () => profiles, childTools: () => [], execChildTool: async () => { throw new Error('none') }, childSystemPrompt: () => '' })
    const call = (args: object) => execOrchestrationTool(rt, { id: 'c', name: 'task', argsText: JSON.stringify(args) })
    expect(JSON.parse((await call({ subagent_type: 'bg', prompt: 'x' })).content).status).toBe('running')
    expect(JSON.parse((await call({ subagent_type: 'bg', prompt: 'x', run_in_background: false })).content).answer).toBe('ok')
    expect(JSON.parse((await call({ subagent_type: 'fg', prompt: 'x' })).content).answer).toBe('ok')
    expect(JSON.parse((await call({ subagent_type: 'fg', prompt: 'x', run_in_background: true })).content).status).toBe('running')
  })

  it('records a child stopped by its parent as stopped, even when the stop surfaces as a thrown error', async () => {
    // A native-style host: a plain stop flag per child, and a model call that throws an ordinary error once stopped.
    const ac = new AbortController()
    const rt = createAgentRuntime({
      callModel: async (_m, _t, _h, signal) => {
        while (!signal?.aborted) await new Promise(r => setTimeout(r, 2))
        throw new Error('request failed: connection closed')
      },
      profiles: () => profiles, childTools: () => [], execChildTool: async () => { throw new Error('none') }, childSystemPrompt: () => '',
      createSignal: () => { const s = { aborted: false } as any; return { signal: s, stop: () => { s.aborted = true } } },
    })
    setTimeout(() => ac.abort(), 10)
    const r = await rt.spawn({ profileId: 'fg', prompt: 'x', signal: ac.signal })
    expect(r.ok).toBe(false)
    expect(rt.get(r.id!)!.status).toBe('stopped')
    expect(r.summary).toBe('(stopped)')
  })

  it('still records a real failure as error', async () => {
    const rt = createAgentRuntime({ callModel: async () => { throw new Error('boom') }, profiles: () => profiles, childTools: () => [], execChildTool: async () => { throw new Error('none') }, childSystemPrompt: () => '' })
    const r = await rt.spawn({ profileId: 'fg', prompt: 'x' })
    expect(rt.get(r.id!)!.status).toBe('error')
    expect(r.summary).toContain('boom')
  })
})
