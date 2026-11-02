import { describe, expect, it } from 'bun:test'
import {
  createAgentRuntime, createHyperyModel, createOrchestration, resolveCatalogModel, runAgentLoop, roleOfProfileModel,
  parseOrchestrationSkill, chooseOrchestrationSkill, skillsForMode,
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

// Skills as a product would ship them (the SDK has no models of its own: these ids are made up).
const ULTRA = `---
name: deep-work
kind: orchestration
description: Large multi-file changes.
modes: ultra
lead: m/lead
lead_effort: high
swarm: m/swarm
swarm_effort: low
advisor: m/advisor
advisor_triggers: plan, done, error
router: m/router
router_threshold: 0.8
max_concurrent: 8
---
Fan out searches first. Advisor: watch for skipped tests.`
const AUTO = `---
name: light
kind: orchestration
description: Everyday tasks.
modes: auto
swarm: m/swarm
max_concurrent: 2
---
Stay one agent unless a search is big.`
const ultra = () => parseOrchestrationSkill(ULTRA)!
const auto = () => parseOrchestrationSkill(AUTO)!

describe('orchestration skills', () => {
  it('parses roles, triggers, limits and guidance from SKILL.md', () => {
    const s = ultra()
    expect(s.name).toBe('deep-work')
    expect(s.modes).toEqual(['ultra'])
    expect(s.roles.lead).toEqual({ model: 'm/lead', effort: 'high', fallback: [] })
    expect(s.roles.advisor.model).toBe('m/advisor')
    expect(s.advisorTriggers).toEqual(['plan', 'done', 'error'])
    expect(s.routerThreshold).toBe(0.8)
    expect(s.maxConcurrent).toBe(8)
    expect(s.guidance).toContain('skipped tests')
  })
  it('ignores a skill that is not an orchestration skill', () => {
    expect(parseOrchestrationSkill('---\nname: x\n---\nhi')).toBeNull()
    expect(parseOrchestrationSkill('no frontmatter')).toBeNull()
  })
  it('picks by mode, and by the host model when several fit', async () => {
    expect(skillsForMode([ultra(), auto()], 'auto').map(s => s.name)).toEqual(['light'])
    expect(skillsForMode([ultra(), auto()], 'off')).toEqual([])
    const both = [ultra(), { ...ultra(), name: 'quick-fix', description: 'One small bug.' }]
    const host: CallModel = async () => turn('quick-fix')
    expect((await chooseOrchestrationSkill(host, both, 'fix the typo', 'ultra'))?.name).toBe('quick-fix')
    expect(await chooseOrchestrationSkill(async () => turn('none'), both, 'x', 'ultra')).toBeNull()
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
    const o = createOrchestration(call, { mode: 'off', skill: ultra() })
    expect(o.callModel).toBe(call)
    expect(o.advise).toBeNull()
    expect(o.route).toBeNull()
    expect(o.childModel('fast')).toBeNull()
  })

  it('no skill: behaves as off, nothing hard-coded', () => {
    const { call } = recorder(() => turn('x'))
    const o = createOrchestration(call, { mode: 'ultra' })
    expect(o.callModel).toBe(call)
    expect(o.skill).toBeNull()
    expect(o.advise).toBeNull()
    expect(o.maxConcurrent).toBeNull()
  })

  it("auto skill: no lead keeps the host's model, read-only children on the skill's swarm", async () => {
    const { seen, call } = recorder(() => turn('done'))
    const o = createOrchestration(call, { mode: 'auto', skill: auto() })
    expect(o.advise).toBeNull()
    expect(o.route).toBeNull()
    expect(o.maxConcurrent).toBe(2)
    await o.childModel('fast')!([], [], {})
    await o.callModel([], [], {})
    expect(seen).toEqual(['m/swarm', undefined])
    expect(o.guidance).toContain('one agent')
  })

  it("ultra skill: the skill's roles, limit, advisor and router", () => {
    const { call } = recorder(() => turn('x'))
    const o = createOrchestration(call, { mode: 'ultra', skill: ultra() })
    expect(o.maxConcurrent).toBe(8)
    expect(o.advise).not.toBeNull()
    expect(o.route).not.toBeNull()
    const noRouter = { ...ultra(), routerThreshold: null }
    expect(createOrchestration(call, { mode: 'ultra', skill: noRouter }).route).toBeNull()
  })

  it('the runtime puts a read-only child on the swarm model', async () => {
    const { seen, call } = recorder(() => turn('found it'))
    const o = createOrchestration(call, { mode: 'auto', skill: auto() })
    const profiles: AgentProfile[] = [{ id: 'explorer', description: 'e', instructions: 'e', tools: ['*'], readOnly: true, model: 'fast' }]
    const rt = createAgentRuntime({ callModel: o.callModel, orchestration: o, profiles: () => profiles, childTools: () => [], execChildTool: ok as any, childSystemPrompt: () => 'sys' })
    const r = await rt.spawn({ profileId: 'explorer', prompt: 'look', description: 'look' } as any)
    expect(r.kind).toBe('done')
    expect(seen).toEqual(['m/swarm'])
  })
})

describe('advisor in the loop (ultra)', () => {
  // The lead calls `t` (which fails the same way twice), then finishes; the advisor always says "revise".
  function setup() {
    const triggers: string[] = []
    let leadTurns = 0
    const call: CallModel = async (msgs, _t, _h, _s, req) => {
      if (req?.model === 'm/advisor') {
        const ask = String(msgs[msgs.length - 1].content)
        triggers.push(ask.includes('about to plan') ? 'plan' : ask.includes('about to say it is done') ? 'done' : ask.includes('same error') ? 'error' : '?')
        return turn(JSON.stringify({ verdict: triggers.length === 1 ? 'ok' : 'revise', advice: ['check the fixture'] }))
      }
      leadTurns++
      return leadTurns <= 2 ? turn('', ['t']) : turn('finished')
    }
    const o = createOrchestration(call, { mode: 'ultra', skill: { ...ultra(), routerThreshold: null } })
    const failing = async (c: any) => ({ id: c.id, name: c.name, argsText: c.argsText, ok: false, summary: 'ENOENT fixture 42', content: '{"error":"x"}' })
    return { triggers, o, failing, leadTurns: () => leadTurns }
  }

  it('consults before planning, on a repeated error and before done; never on a routine round', async () => {
    const { triggers, o, failing } = setup()
    const out = await runAgentLoop({ messages: [{ role: 'user', content: 'go' }], tools: [tool('t')], callModel: o.callModel, execTool: failing, advise: o.advise })
    expect(triggers).toEqual(['plan', 'error', 'done'])
    expect(out.messages.some(m => typeof m.content === 'string' && m.content.startsWith('Advisor (error)'))).toBe(true)
  })

  it('a skill without an advisor never consults', async () => {
    let calls = 0
    const call: CallModel = async (_m, _t, _h, _s, req) => { calls++; if (req?.model === 'm/advisor') throw new Error('advisor called'); return turn('done') }
    const o = createOrchestration(call, { mode: 'auto', skill: auto() })
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
    const o = createOrchestration(call, { mode: 'ultra', skill: { ...ultra(), roles: { lead: ultra().roles.lead, router: ultra().roles.router } } })
    await runAgentLoop({ messages: [{ role: 'user', content: 'go' }], tools: [tool('edit', false)], callModel: o.callModel, execTool: ok, route: o.route })
    return choices[0]
  }
  it('forces a sharp pick and leaves a split one to the lead', async () => {
    expect(await run(0.96)).toEqual({ type: 'function', function: { name: 'edit' } })
    expect(await run(0.47)).toBeNull()
  })
})
