import { describe, expect, it } from 'bun:test'
import { BUILTIN_PROFILES, compactTranscript, createAgentRuntime, createHyperyModel, createTodoList, interruptedRuns, isAgentModelError, memoryStore, pruneOldImages, repairTranscript, resumeRun, runAgentLoop, runPersistent, runStore, runSupervised, sessionStore, verdictOf, type AgentEvent, type AgentHost, type AgentRuntime, type ChatMessage, type LoopTool, type ModelTurn } from '../index.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileStore } from '../node/index.js'

const tool = (name: string, readOnly: boolean): LoopTool => ({ readOnly, spec: { type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } } })
const turn = (text: string, calls: [string, object?][] = []): ModelTurn => ({ text, toolCalls: calls.map(([name, args], i) => ({ id: `${name}-${i}-${Math.random()}`, name, arguments: JSON.stringify(args ?? {}) })) })
const sse = (frames: object[]) => new Response(frames.map(f => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })

describe('createHyperyModel', () => {
  it('streams text and assembles tool calls, sending the team and payment-source headers', async () => {
    let headers: Record<string, string> = {}
    const model = createHyperyModel({
      token: 't', model: 'm', team: 'team1', paymentSource: 'credits',
      fetch: (async (_u: string, init: RequestInit) => {
        headers = init.headers as Record<string, string>
        return sse([
          { choices: [{ delta: { content: 'Hel' } }] }, { choices: [{ delta: { content: 'lo' } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'edit', arguments: '{"a"' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':1}' } }] } }] },
        ])
      }) as unknown as typeof fetch,
    })
    const deltas: string[] = []
    const out = await model([{ role: 'user', content: 'hi' }], [], { onTextDelta: d => deltas.push(d) })
    expect(out.text).toBe('Hello')
    expect(deltas).toEqual(['Hel', 'lo'])
    expect(out.toolCalls).toEqual([{ id: 'c1', name: 'edit', arguments: '{"a":1}' }])
    expect(headers['x-hypery-active-organization-id']).toBe('team1')
    expect(headers['x-hypery-payment-source']).toBe('credits')
  })

  it('maps errors to codes and refuses oversized requests', async () => {
    const credits = createHyperyModel({ token: 't', model: 'm', fetch: (async () => new Response(JSON.stringify({ error: { message: 'Out of credits' } }), { status: 402 })) as unknown as typeof fetch })
    await expect(credits([{ role: 'user', content: 'x' }], [], {})).rejects.toMatchObject({ code: 'ai_credits', message: 'Out of credits' })
    const big = createHyperyModel({ token: 't', model: 'm', maxRequestBytes: 10, fetch: (async () => sse([])) as unknown as typeof fetch })
    await expect(big([{ role: 'user', content: 'a long message' }], [], {})).rejects.toMatchObject({ code: 'too_large' })
    const noToken = createHyperyModel({ token: null, model: 'm' })
    await expect(noToken([], [], {})).rejects.toMatchObject({ name: "AgentModelError", code: "ai_reauth", status: 401 })
  })
})

describe('context', () => {
  it('keeps the latest rendered views and compacts a long transcript without splitting tool results', async () => {
    const render = (i: number): ChatMessage => ({ role: 'user', content: [{ type: 'text', text: `Result of look: ${i}` }, { type: 'image_url', image_url: { url: 'data:x' } }] })
    const msgs: ChatMessage[] = [render(1), render(2), render(3)]
    pruneOldImages(msgs, 2)
    expect(typeof msgs[0].content).toBe('string')
    expect(Array.isArray(msgs[2].content)).toBe(true)

    const long: ChatMessage[] = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'do it' }]
    for (let i = 0; i < 20; i++) long.push({ role: 'assistant', content: 'x'.repeat(100), tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'read', arguments: '{}' } }] }, { role: 'tool', tool_call_id: `c${i}`, content: 'y'.repeat(100) })
    expect(await compactTranscript(long, { maxChars: 1000, keepRecent: 5, summarize: async () => 'did twenty reads' })).toBe(true)
    expect(long[0].content).toBe('sys')
    expect(long[1].content).toBe('do it')
    expect(String(long[2].content)).toContain('did twenty reads')
    expect(long[3].role).not.toBe('tool')
  })
})

describe('checkpoints and resume', () => {
  it('answers tool calls a crash cut off', () => {
    const fixed = repairTranscript([{ role: 'user', content: 'go' }, { role: 'assistant', content: '', tool_calls: [{ id: 'a', type: 'function', function: { name: 'edit', arguments: '{}' } }] }])
    expect(fixed[2]).toMatchObject({ role: 'tool', tool_call_id: 'a' })
  })

  it('checkpoints every round, lists a run a crash left behind, and resumes it', async () => {
    const runs = runStore(memoryStore())
    let crash = true
    const tools = [tool('edit', false)]
    const callModel = async (msgs: ChatMessage[]) => {
      if (crash && msgs.filter(m => m.role === 'tool').length === 1) throw Object.assign(new Error('boom'), { status: 400 })
      return msgs.some(m => m.role === 'tool') ? (crash ? turn('', [['edit']]) : turn('Finished.')) : turn('', [['edit']])
    }
    await expect(runPersistent({ id: 'r1', runs, messages: [{ role: 'user', content: 'go' }], tools, callModel, execTool: async c => ({ ...c, ok: true, summary: 'ok', content: '{}' }) })).rejects.toThrow('boom')
    expect((await runs.get('r1'))!.status).toBe('error')
    // A run left "running" (the process died): offered for resume.
    const saved = (await runs.get('r1'))!
    await runs.save({ ...saved, status: 'running' })
    expect((await interruptedRuns(runs)).map(r => r.id)).toEqual(['r1'])
    crash = false
    const out = await resumeRun('r1', runs, { tools, callModel, execTool: async c => ({ ...c, ok: true, summary: 'ok', content: '{}' }) })
    expect(out.text).toBe('Finished.')
    expect((await runs.get('r1'))!.status).toBe('done')
    expect((await runs.get('r1'))!.checkpoint.messages.some(m => String(m.content).includes('interrupted and has resumed'))).toBe(true)
  })
})

describe('stores', () => {
  it('file store keeps sessions and runs across instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agents-'))
    await sessionStore(fileStore(dir), 'doc1').save({ id: 's1', profile: 'builder', description: 'd', status: 'done', background: false, transcript: [], inbox: [], startedAt: 1, rounds: 1 })
    expect((await sessionStore(fileStore(dir), 'doc1').load()).map(s => s.id)).toEqual(['s1'])
    expect(await sessionStore(fileStore(dir), 'doc2').load()).toEqual([])
  })
})

describe('todos', () => {
  it('replaces and updates the plan', () => {
    const seen: number[] = []
    const list = createTodoList([], t => seen.push(t.length))
    list.run({ id: '1', name: 'manage_todos', argsText: JSON.stringify({ replace: [{ text: 'Plan' }, { text: 'Build' }] }) })
    const r = list.run({ id: '2', name: 'manage_todos', argsText: JSON.stringify({ update: [{ id: '1', status: 'done' }] }) })
    expect(r.summary).toBe('1/2 done')
    expect(list.open().map(t => t.text)).toEqual(['Build'])
    expect(seen).toEqual([2, 2])
  })
})

function host(script: (system: string, prompt: string, msgs: ChatMessage[]) => ModelTurn, extra: Partial<AgentHost> = {}): AgentHost {
  return {
    profiles: () => BUILTIN_PROFILES,
    callModel: async msgs => script(String(msgs[0]?.content ?? ''), String(msgs.find(m => m.role === 'user')?.content ?? ''), msgs),
    childTools: ctx => (ctx.readOnly ? [tool('read', true)] : [tool('read', true), tool('edit', false)]),
    execChildTool: async c => ({ ...c, ok: true, summary: 'ok', content: '{}' }),
    childSystemPrompt: ctx => ctx.profile.id,
    ...extra,
  }
}

describe('supervisor', () => {
  it('builds, fails review, fixes with the builder\'s context, passes', async () => {
    let reviews = 0
    const rt = createAgentRuntime(host((system, _prompt, msgs) => {
      if (system === 'reviewer') return turn(++reviews === 1 ? 'FAIL\n1. Make it blue' : 'PASS')
      const last = msgs[msgs.length - 1]
      if (last.role === 'tool') return turn(String(msgs.some(m => String(m.content).includes('Make it blue')) ? 'Made it blue.' : 'Built it red.'))
      return turn('', [['edit']])
    }))
    const events: string[] = []
    const r = await runSupervised(rt, { request: 'Build a blue card', onEvent: e => events.push(`${e.phase}${e.verdict ? `:${e.verdict}` : ''}`) })
    expect(r).toMatchObject({ passed: true, reviews: 2, report: 'Made it blue.' })
    expect(events).toEqual(['build', 'review:fail', 'fix', 'review:pass'])
    expect(verdictOf('FAIL: nope')).toBe('fail')
  })
})

describe('runtime', () => {
  it('queues background agents past the limit and reports questions and events', async () => {
    const events: AgentEvent[] = []
    let open = 0
    let peak = 0
    const gates: (() => void)[] = []
    const rt = createAgentRuntime(host(() => turn('done'), {
      maxConcurrent: 2,
      onEvent: e => events.push(e),
      callModel: async () => {
        peak = Math.max(peak, ++open)
        await new Promise<void>(res => gates.push(res))
        open--
        return turn('done')
      },
    }))
    const ids = await Promise.all([1, 2, 3].map(i => rt.spawn({ profileId: 'explorer', prompt: `look ${i}`, background: true })))
    expect(rt.list().filter(s => s.status === 'queued')).toHaveLength(1)
    while (rt.list().some(s => s.status !== 'done')) { gates.shift()?.(); await new Promise(res => setTimeout(res, 1)) }
    expect(peak).toBe(2)
    expect(ids.every(r => r.kind === 'started')).toBe(true)
    rt.report(rt.list()[0].id, 'Which colour?', true)
    expect(rt.drainParentNotifications().pop()).toContain('QUESTION')
    expect(events.some(e => e.type === 'report' && e.question)).toBe(true)
  })
})
