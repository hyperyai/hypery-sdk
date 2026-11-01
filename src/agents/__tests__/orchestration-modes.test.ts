import { describe, expect, it } from 'bun:test'
import {
  createAgentRuntime, createHyperyModel, createOrchestration, resolveCatalogModel, runAgentLoop, roleOfProfileModel,
  type AgentProfile, type CallModel, type LoopTool, type ModelRequest, type ModelTurn,
} from '../index.js'

const tool = (name: string, readOnly = true): LoopTool => ({ readOnly, spec: { type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } } })
const turn = (text: string, calls: string[] = []): ModelTurn => ({ text, toolCalls: calls.map((name, i) => ({ id: `${name}-${i}-${Math.random()}`, name, arguments: '{}' })) })
const sse = () => new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }) + '\n\ndata: [DONE]\n\n', { status: 200 })
const ok = async (c: any) => ({ id: c.id, name: c.name, argsText: c.argsText, ok: true, summary: 'ok', content: '{}' })

describe('effort and per-request model', () => {
  it('createHyperyModel sends reasoning.effort and lets a request override model and effort', async () => {
    const bodies: any[] = []
    const model = createHyperyModel({ token: 't', model: 'base', effort: 'medium', fetch: (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return sse() }) as unknown as typeof fetch })
    const msgs = [{ role: 'user' as const, content: 'hi' }]
    await model(msgs, [], {})
    await model(msgs, [], {}, null, { model: 'other', effort: 'high' })
    expect(bodies.map(b => [b.model, b.reasoning?.effort])).toEqual([['base', 'medium'], ['other', 'high']])
  })
})

describe('roles', () => {
  it('falls back along the chain to a model the catalog has', () => {
    expect(resolveCatalogModel('a', ['b', 'c'], ['c', 'x'])).toBe('c')
    expect(resolveCatalogModel('a', ['b'], [{ id: 'a' }])).toBe('a')
    expect(resolveCatalogModel('a', ['b'], null)).toBe('a')
  })
  it("keeps 'fast' and 'inherit' working", () => {
    expect(roleOfProfileModel('fast')).toBe('swarm')
    expect(roleOfProfileModel('inherit')).toBe('lead')
    expect(roleOfProfileModel(null)).toBe('lead')
    expect(roleOfProfileModel('advisor')).toBe('advisor')
    expect(roleOfProfileModel('openai/gpt-5')).toBe(null)
  })
})

// A model that records each request's model and answers by role.
function recorder(answer: (req: ModelRequest | undefined, msgs: any[]) => ModelTurn) {
  const seen: (string | undefined)[] = []
  const call: CallModel = async (msgs, _t, _h, _s, req) => { seen.push(req?.model ?? undefined); return answer(req ?? undefined, msgs) }
  return { seen, call }
}

describe('modes', () => {
  it('off: the host model untouched, no advisor or router', () => {
    const { call } = recorder(() => turn('x'))
    const o = createOrchestration(call, { mode: 'off' })
    expect(o.callModel).toBe(call)
    expect(o.advise).toBeNull()
    expect(o.route).toBeNull()
    expect(o.childModel('fast')).toBeNull()
  })

  it('auto: no advisor or router, a small cap, read-only children on the swarm model', async () => {
    const { seen, call } = recorder(() => turn('done'))
    const events: any[] = []
    const o = createOrchestration(call, { mode: 'auto', onEvent: e => events.push(e) })
    expect(o.advise).toBeNull()
    expect(o.route).toBeNull()
    expect(o.maxConcurrent).toBe(2)
    await o.childModel('fast')!([], [], {})
    await o.callModel([], [], {})
    expect(seen).toEqual(['anthropic/claude-haiku-5.5', 'anthropic/claude-sonnet-5.5'])
    expect(events.filter(e => e.type === 'role:model').map(e => e.role).sort()).toEqual(['lead', 'swarm'])
  })

  it('ultra: advisor on, swarm width follows effort, router only when asked', () => {
    const { call } = recorder(() => turn('x'))
    expect(createOrchestration(call, { mode: 'ultra', effort: 'high' }).maxConcurrent).toBe(12)
    expect(createOrchestration(call, { mode: 'ultra' }).advise).not.toBeNull()
    expect(createOrchestration(call, { mode: 'ultra' }).route).toBeNull()
    expect(createOrchestration(call, { mode: 'ultra', router: true }).route).not.toBeNull()
  })

  it('the runtime puts a read-only child on the swarm model and caps by mode', async () => {
    const { seen, call } = recorder(() => turn('found it'))
    const o = createOrchestration(call, { mode: 'auto' })
    const profiles: AgentProfile[] = [{ id: 'explorer', description: 'e', instructions: 'e', tools: ['*'], readOnly: true, model: 'fast' }]
    const rt = createAgentRuntime({ callModel: o.callModel, orchestration: o, profiles: () => profiles, childTools: () => [], execChildTool: ok as any, childSystemPrompt: () => 'sys' })
    const r = await rt.spawn({ profileId: 'explorer', prompt: 'look', description: 'look' } as any)
    expect(r.kind).toBe('done')
    expect(seen).toEqual(['anthropic/claude-haiku-5.5'])
  })
})

describe('advisor in the loop (ultra)', () => {
  // The lead calls `t` (which fails the same way twice), then finishes; the advisor always says "revise".
  function setup() {
    const triggers: string[] = []
    let leadTurns = 0
    const call: CallModel = async (msgs, _t, _h, _s, req) => {
      if (req?.model === 'anthropic/claude-opus-5.5') {
        const ask = String(msgs[msgs.length - 1].content)
        triggers.push(ask.includes('about to plan') ? 'plan' : ask.includes('about to say it is done') ? 'done' : ask.includes('same error') ? 'error' : '?')
        return turn(JSON.stringify({ verdict: triggers.length === 1 ? 'ok' : 'revise', advice: ['check the fixture'] }))
      }
      leadTurns++
      return leadTurns <= 2 ? turn('', ['t']) : turn('finished')
    }
    const o = createOrchestration(call, { mode: 'ultra' })
    const failing = async (c: any) => ({ id: c.id, name: c.name, argsText: c.argsText, ok: false, summary: 'ENOENT fixture 42', content: '{"error":"x"}' })
    return { triggers, o, failing, leadTurns: () => leadTurns }
  }

  it('consults before planning, on a repeated error and before done; never on a routine round', async () => {
    const { triggers, o, failing } = setup()
    const out = await runAgentLoop({ messages: [{ role: 'user', content: 'go' }], tools: [tool('t')], callModel: o.callModel, execTool: failing, advise: o.advise })
    expect(triggers).toEqual(['plan', 'error', 'done'])
    expect(out.messages.some(m => typeof m.content === 'string' && m.content.startsWith('Advisor (error)'))).toBe(true)
  })

  it('auto never consults', async () => {
    let calls = 0
    const call: CallModel = async (_m, _t, _h, _s, req) => { calls++; if (req?.model?.includes('opus')) throw new Error('advisor called'); return turn('done') }
    const o = createOrchestration(call, { mode: 'auto' })
    await runAgentLoop({ messages: [{ role: 'user', content: 'go' }], tools: [tool('t')], callModel: o.callModel, execTool: ok, advise: o.advise })
    expect(calls).toBe(1)
  })
})

describe('router', () => {
  async function run(p: number) {
    const choices: any[] = []
    const call: CallModel = async (msgs, _t, _h, _s, req) => {
      if (String(msgs[0].content).startsWith('You pick the next tool')) return turn(JSON.stringify({ tool: 'edit', p }))
      choices.push(req?.toolChoice ?? null)
      return msgs.some(m => m.role === 'tool') ? turn('done') : turn('', ['edit'])
    }
    const o = createOrchestration(call, { mode: 'ultra', advisor: false, router: { threshold: 0.8 } })
    await runAgentLoop({ messages: [{ role: 'user', content: 'go' }], tools: [tool('edit', false)], callModel: o.callModel, execTool: ok, route: o.route })
    return choices[0]
  }
  it('forces a sharp pick and leaves a split one to the lead', async () => {
    expect(await run(0.96)).toEqual({ type: 'function', function: { name: 'edit' } })
    expect(await run(0.47)).toBeNull()
  })
})
