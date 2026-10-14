import { describe, expect, it } from 'bun:test'
import { memoryStore, resumeRun, runAgentLoop, runPersistent, runStore, type CallModel, type LoopCheckpoint, type LoopTool, type ModelTurn } from '../index.js'

const tool = (name: string, readOnly: boolean): LoopTool => ({ readOnly, spec: { type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {} } } } })
const turn = (text: string, calls: string[] = []): ModelTurn => ({ text, toolCalls: calls.map((name, i) => ({ id: `${name}-${Math.random()}-${i}`, name, arguments: '{}' })) })
const ok = async (c: any) => ({ id: c.id, name: c.name, argsText: c.argsText, ok: true, summary: 'ok', content: 'did ' + c.id })

describe('saves after each tool call', () => {
  it('checkpoints every finished call by id, and a resume reuses it instead of running the tool again', async () => {
    const runs = runStore(memoryStore(), 't')
    const ran: string[] = []
    const saves: LoopCheckpoint[] = []
    let crash = true
    const callModel: CallModel = async msgs => {
      const last = msgs[msgs.length - 1]
      if (last.role === 'user' && last.content === 'go') return { text: '', toolCalls: [{ id: 'a', name: 'edit', arguments: '{}' }, { id: 'b', name: 'edit', arguments: '{}' }] }
      return turn('done')
    }
    const opts = {
      tools: [tool('edit', false)], callModel,
      execTool: async (c: any) => { ran.push(c.id); return ok(c) },
      checkpoint: (s: LoopCheckpoint) => { saves.push(s); if (crash && Object.keys(s.toolResults).length) throw new Error('crash') },
    }
    await expect(runPersistent({ ...opts, id: 'r', runs, messages: [{ role: 'user', content: 'go' }] })).rejects.toThrow('crash')
    const cut = (await runs.get('r'))!.checkpoint
    expect(cut.toolResults.a).toMatchObject({ id: 'a', name: 'edit', ok: true, content: 'did a' })
    expect(cut.acted).toBe(true)
    expect(cut.done).toBe(false)
    crash = false
    const out = await resumeRun('r', runs, opts)
    expect(ran).toEqual(['a'])
    const results = out.messages.filter(m => m.role === 'tool')
    expect(results.map(m => [m.tool_call_id, String(m.content).includes('interrupted') ? 'interrupted' : m.content])).toEqual([['a', 'did a'], ['b', 'interrupted']])
    expect((await runs.get('r'))!.checkpoint.toolResults).toEqual({})
  })

  it('saves after each call of a parallel batch, as each finishes', async () => {
    const saves: LoopCheckpoint[] = []
    let first = true
    await runAgentLoop({
      messages: [{ role: 'user', content: 'go' }], tools: [tool('read', true)],
      execTool: async (c: any) => { await new Promise(r => setTimeout(r, Number(c.id.split('-').pop()) * 10)); return ok(c) },
      callModel: async () => first ? (first = false, turn('', ['read', 'read', 'read'])) : turn('done'),
      checkpoint: s => { saves.push(s) },
    })
    expect(saves.slice(0, 3).map(s => Object.keys(s.toolResults).length)).toEqual([1, 2, 3])
  })
})

describe('requireAction.maxReadRounds', () => {
  it('after N reading rounds, nudges and requires a tool call next', async () => {
    const choices: unknown[] = []
    const nudges: string[] = []
    const out = await runAgentLoop({
      messages: [{ role: 'user', content: 'change it' }], tools: [tool('read', true), tool('edit', false)], execTool: ok,
      requireAction: { maxReadRounds: 3, readMessage: 'act now' }, hooks: { onNudge: m => nudges.push(m) },
      callModel: async (msgs, _t, _h, _s, req) => {
        choices.push(req?.toolChoice ?? null)
        const last = msgs[msgs.length - 1]
        if (msgs.some(m => m.role === 'tool' && m.name === 'edit')) return turn('changed')
        return turn('', [last.content === 'act now' ? 'edit' : 'read'])
      },
    })
    expect(choices).toEqual([null, null, null, 'required', null])
    expect(nudges).toEqual(['act now'])
    expect(out.acted).toBe(true)
  })

  it('carries the read count and the forced call across a resume', async () => {
    const saves: LoopCheckpoint[] = []
    await runAgentLoop({
      messages: [{ role: 'user', content: 'x' }], tools: [tool('read', true), tool('edit', false)], execTool: ok, maxRounds: 2,
      requireAction: { maxReadRounds: 2 }, callModel: async () => turn('', ['read']), checkpoint: s => { saves.push(s) },
    })
    const roundEnd = saves.filter(s => Object.keys(s.toolResults).length === 0 && !s.done)
    expect(roundEnd.map(s => [s.readRounds, s.mustCallTool])).toEqual([[1, false], [2, true]])
    const choices: unknown[] = []
    await runAgentLoop({
      messages: roundEnd[1].messages, tools: [tool('read', true), tool('edit', false)], execTool: ok,
      resumeState: { round: 2, readRounds: 2, mustCallTool: true }, requireAction: { maxReadRounds: 2 },
      callModel: async (_m, _t, _h, _s, req) => { choices.push(req?.toolChoice ?? null); return turn('done') },
    })
    expect(choices[0]).toBe('required')
  })
})
