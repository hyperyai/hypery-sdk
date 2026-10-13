// The agent loop: assistant turn → tool calls → run them → feed the results back → repeat, until the model is done.
//
// Shared by every Hypery app (PopCraft's editor agent, Dune's IDE agent, Hypery's own). The loop knows nothing about
// a product or a transport: the host passes `callModel` and `execTool`. Ported from dune-ide's `runAgentLoop` and
// PopCraft's lib/agent/loop.ts, with what both lacked:
// - `requireAction`: a turn asked to change something that ends having changed nothing is told to act, rather than
//   quietly stopping after a few minutes of reading (Cursor and Claude Code keep going until the work is done);
// - `drainNotifications` doubles as an inbox: a parent's messages to a running child, a child's reports to its
//   parent, finished background agents — all land between rounds, and one arriving as the model stops continues it;
// - a dropped or stalled model stream is retried (dune's isRecoverableModelTimeout).

import type { CallModel, ChatMessage, ChatToolSpec, ModelHooks, ToolCall, ToolRun } from './types'

export interface LoopTool {
  spec: ChatToolSpec
  /** Read-only tools (and agent spawns) may run together; anything that edits runs in order. */
  readOnly?: boolean
  /** Changes something (a document, files): what `requireAction` counts as acting. Defaults to `!readOnly`. */
  acts?: boolean
}

export interface LoopHooks extends ModelHooks {
  onAssistantStart?: (round: number) => void
  onToolStart?: (call: ToolCall) => void
  onToolEnd?: (run: ToolRun) => void
  onRoundEnd?: (round: number) => void
  /** The loop told the model to act (requireAction) — for the host's UI. */
  onNudge?: (message: string) => void
}

export interface LoopOptions {
  messages: ChatMessage[]
  tools: LoopTool[]
  callModel: CallModel
  /** Run one tool call; returning `ok: false` feeds the error back so the model can correct itself. */
  execTool: (call: ToolCall) => Promise<ToolRun>
  hooks?: LoopHooks
  signal?: AbortSignal
  stopped?: () => boolean
  /** Messages to inject between rounds (inbox, reports, finished background agents). */
  drainNotifications?: () => string[]
  /** 0 = unlimited (a backstop, not a budget, is the host's choice). Default 40. */
  maxRounds?: number
  /** How many independent (read-only) calls may run at once. */
  maxParallel?: number
  /** Result text longer than this is truncated before it goes back to the model. */
  maxResultChars?: number
  /**
   * The task asks for a change: if the model tries to finish without having called an acting tool, it is told to
   * act (at most `nudges` times, default 2), instead of the turn ending with nothing done.
   */
  requireAction?: boolean | { nudges?: number; message?: string }
  /** Retries for a model call that fails with a recoverable error (timeouts, dropped streams). Default 2. */
  modelRetries?: number
  /** Which model errors are worth retrying. Default: timeouts, aborts not from `signal`, network drops, 5xx. */
  isRecoverable?: (err: unknown) => boolean
}

export interface LoopOutcome {
  messages: ChatMessage[]
  text: string
  rounds: number
  /** Hit `maxRounds` with the model still asking for tools. */
  exhausted: boolean
  stopped: boolean
  /** Whether any acting tool ran. */
  acted: boolean
}

export const DEFAULT_MAX_ROUNDS = 40
export const DEFAULT_MAX_PARALLEL = 4
export const DEFAULT_ACTION_NUDGE =
  'You have not changed anything yet. Stop reading and do what was asked now, with the tools that make changes. If you truly cannot, say exactly what is blocking you.'

/** Split calls into batches: a run of independent calls together, anything that acts on its own, in order. */
export function batchCalls<T extends { name: string }>(calls: T[], isParallel: (name: string) => boolean, max: number): T[][] {
  const batches: T[][] = []
  for (const call of calls) {
    const last = batches[batches.length - 1]
    const parallel = isParallel(call.name)
    if (parallel && last && last.length < max && isParallel(last[0].name)) last.push(call)
    else batches.push([call])
  }
  return batches
}

export function truncateResult(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated ${text.length - max} characters]`
}

const RENDER_TURN_PREFIX = 'Result of '

export function defaultIsRecoverable(err: unknown): boolean {
  const e = err as { name?: string; status?: number; code?: string; message?: string } | null
  if (!e) return false
  if (typeof e.status === 'number') return e.status >= 500 || e.status === 408 || e.status === 429
  const text = `${e.name ?? ''} ${e.code ?? ''} ${e.message ?? ''}`.toLowerCase()
  return /timeout|timed out|stalled|network|fetch failed|econnreset|socket|stream/.test(text)
}

export async function runAgentLoop(opts: LoopOptions): Promise<LoopOutcome> {
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS
  const maxResultChars = opts.maxResultChars ?? 8_000
  const specs = opts.tools.map(t => t.spec)
  const parallelNames = new Set(opts.tools.filter(t => t.readOnly).map(t => t.spec.function.name))
  const actingNames = new Set(opts.tools.filter(t => t.acts ?? !t.readOnly).map(t => t.spec.function.name))
  const require = opts.requireAction ? (typeof opts.requireAction === 'object' ? opts.requireAction : {}) : null
  let nudgesLeft = require ? (require.nudges ?? 2) : 0
  const isStopped = () => opts.signal?.aborted === true || opts.stopped?.() === true
  const messages = [...opts.messages]
  let text = ''
  let acted = false

  const call = async (msgs: ChatMessage[], tools: ChatToolSpec[]) => {
    const retries = opts.modelRetries ?? 2
    const recoverable = opts.isRecoverable ?? defaultIsRecoverable
    for (let attempt = 0; ; attempt++) {
      try {
        return await opts.callModel(msgs, tools, {
          onTextDelta: opts.hooks?.onTextDelta,
          onReasoningDelta: opts.hooks?.onReasoningDelta,
          onToolProgress: opts.hooks?.onToolProgress,
        }, opts.signal)
      } catch (err) {
        if (isStopped() || attempt >= retries || !recoverable(err)) throw err
      }
    }
  }

  for (let round = 0; maxRounds === 0 || round < maxRounds; round++) {
    if (isStopped()) return { messages, text, rounds: round, exhausted: false, stopped: true, acted }
    for (const note of opts.drainNotifications?.() ?? []) messages.push({ role: 'user', content: note })
    opts.hooks?.onAssistantStart?.(round)

    const turn = await call(messages, specs)
    text = turn.text
    messages.push({
      role: 'assistant',
      content: turn.text,
      ...(turn.toolCalls.length
        ? { tool_calls: turn.toolCalls.map(c => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })) }
        : {}),
    })

    if (!turn.toolCalls.length) {
      opts.hooks?.onRoundEnd?.(round)
      // Anything that arrived while the model was answering (a report, a finished agent) gets one more round.
      const late = opts.drainNotifications?.() ?? []
      if (late.length) { for (const note of late) messages.push({ role: 'user', content: note }); continue }
      // Asked to change something, changed nothing: act (Cursor / Claude Code keep going until the work is done).
      if (require && !acted && nudgesLeft > 0 && actingNames.size > 0) {
        nudgesLeft--
        const nudge = require.message ?? DEFAULT_ACTION_NUDGE
        opts.hooks?.onNudge?.(nudge)
        messages.push({ role: 'user', content: nudge })
        continue
      }
      return { messages, text, rounds: round + 1, exhausted: false, stopped: false, acted }
    }

    const calls: ToolCall[] = turn.toolCalls.map(c => ({ id: c.id, name: c.name, argsText: c.arguments }))
    // Every tool_call must be answered before any other message, so render images go out after the round's results.
    const imageTurns: ChatMessage[] = []
    for (const batch of batchCalls(calls, n => parallelNames.has(n), opts.maxParallel ?? DEFAULT_MAX_PARALLEL)) {
      if (isStopped()) {
        // Answer the unanswered calls so the transcript stays valid for a resume.
        for (const c of calls) if (!messages.some(m => m.role === 'tool' && m.tool_call_id === c.id)) messages.push({ role: 'tool', tool_call_id: c.id, name: c.name, content: JSON.stringify({ error: 'stopped' }) })
        return { messages, text, rounds: round + 1, exhausted: false, stopped: true, acted }
      }
      for (const info of batch) opts.hooks?.onToolStart?.(info)
      const runs = await Promise.all(batch.map(async info => {
        try {
          return await opts.execTool(info)
        } catch (err) {
          const message = (err as Error)?.message ?? String(err)
          return { ...info, ok: false, summary: message, content: JSON.stringify({ error: message }) } satisfies ToolRun
        }
      }))
      for (const run of runs) {
        if (run.ok && actingNames.has(run.name)) acted = true
        opts.hooks?.onToolEnd?.(run)
        messages.push({ role: 'tool', tool_call_id: run.id, name: run.name, content: truncateResult(run.content, maxResultChars) })
        if (run.images?.length) {
          imageTurns.push({
            role: 'user',
            content: [
              { type: 'text', text: `${RENDER_TURN_PREFIX}${run.name}: ${run.images.length === 1 ? 'the rendered view' : `${run.images.length} rendered views`}.` },
              ...run.images.map(url => ({ type: 'image_url', image_url: { url } })),
            ],
          })
        }
      }
    }
    for (const m of imageTurns) messages.push(m)
    opts.hooks?.onRoundEnd?.(round)
  }

  // Out of rounds with tools still pending: wrap up in words, so the user gets an answer.
  messages.push({ role: 'user', content: 'You have reached the tool limit for this turn. Summarise what you changed and what is left, without calling more tools.' })
  const final = await call(messages, [])
  messages.push({ role: 'assistant', content: final.text })
  return { messages, text: final.text, rounds: maxRounds, exhausted: true, stopped: false, acted }
}
