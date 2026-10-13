// The model call for Hypery's gateway (`POST /api/v1/chat/completions`, OpenAI-style SSE), so no app writes its own
// streaming client. Ported from PopCraft's lib/agent/gateway.ts and stream-parse.ts.
//
// - Streams text, reasoning and tool-call deltas to the loop's hooks.
// - An idle watchdog ends a stream that stops sending (180 s, as dune and PopCraft use).
// - Errors are `AgentModelError`s with a message safe to show and a stable `code` (ai_reauth, ai_credits, ai_scope,
//   ai_rate_limited, ai_timeout, too_large, network, ai_upstream) — and `status`, which the loop's retry reads.
// - The app supplies the token, the billed team and the payment source (`x-hypery-payment-source: credits` in App Store
//   builds), so the same call works in a browser, an iPad shell, Node or Dune.

import type { CallModel, ChatMessage, ChatToolSpec, ModelHooks, ModelTurn } from './types.js'

export class AgentModelError extends Error {
  constructor(message: string, readonly code = 'ai_upstream', readonly status = 502) {
    super(message)
    this.name = 'AgentModelError'
  }
}

/** Hypery's host refuses request bodies over 4.5 MB (before Hypery runs, without CORS headers). */
export const MAX_REQUEST_BYTES = 4_400_000
export const DEFAULT_IDLE_TIMEOUT_MS = 180_000
export const HYPERY_TEAM_HEADER = 'x-hypery-active-organization-id'
export const HYPERY_PAYMENT_SOURCE_HEADER = 'x-hypery-payment-source'

type Lazy<T> = T | (() => T | Promise<T>)
const resolve = async <T>(v: Lazy<T>): Promise<T> => (typeof v === 'function' ? await (v as () => T | Promise<T>)() : v)

export interface HyperyModelOptions {
  /** The user's Hypery access token (OAuth bearer). */
  token: Lazy<string | null | undefined>
  /** Model id, e.g. `anthropic/claude-sonnet-4.5`. */
  model: Lazy<string>
  /** Default `https://hypery.ai`. */
  gatewayUrl?: string
  /** The Hypery team to bill (absent = the personal team). */
  team?: Lazy<string | null | undefined>
  /** `'credits'`: pay from credits only (App Store builds); absent = the team's usual billing. */
  paymentSource?: Lazy<'credits' | null | undefined>
  maxTokens?: number
  temperature?: number
  idleTimeoutMs?: number
  maxRequestBytes?: number
  fetch?: typeof fetch
}

export function createHyperyModel(opts: HyperyModelOptions): CallModel {
  const doFetch = opts.fetch ?? fetch
  return async (messages: ChatMessage[], tools: ChatToolSpec[], hooks: ModelHooks, signal?: AbortSignal): Promise<ModelTurn> => {
    const token = await resolve(opts.token)
    if (!token) throw new AgentModelError('Sign in to Hypery to use the agent.', 'ai_reauth', 401)
    const [model, team, paymentSource] = await Promise.all([resolve(opts.model), resolve(opts.team ?? null), resolve(opts.paymentSource ?? null)])
    const body = JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: opts.maxTokens ?? (tools.length ? 16_384 : 4_096),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
    })
    const limit = opts.maxRequestBytes ?? MAX_REQUEST_BYTES
    if (body.length > limit) {
      throw new AgentModelError(`This message is too large to send (${(body.length / 1_000_000).toFixed(1)} MB with its images). Send fewer or smaller images.`, 'too_large', 413)
    }
    const res = await doFetch(`${(opts.gatewayUrl ?? 'https://hypery.ai').replace(/\/$/, '')}/api/v1/chat/completions`, {
      method: 'POST',
      signal,
      body,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(team ? { [HYPERY_TEAM_HEADER]: team } : {}),
        ...(paymentSource ? { [HYPERY_PAYMENT_SOURCE_HEADER]: paymentSource } : {}),
      },
    }).catch(err => {
      if ((err as Error)?.name === 'AbortError') throw err
      throw new AgentModelError('Could not reach Hypery. Check your connection.', 'network', 0)
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      let payload: unknown = text
      try { payload = JSON.parse(text) } catch { /* plain-text error */ }
      throw new AgentModelError(streamErrorMessage(payload, `The AI request failed (${res.status}).`), errorCodeFor(res.status, payload), res.status)
    }
    const acc = createStreamAccumulator()
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let idle: ReturnType<typeof setTimeout> | undefined
    try {
      await new Promise<void>((done, fail) => {
        const arm = () => {
          clearTimeout(idle)
          idle = setTimeout(() => fail(new AgentModelError('The model stopped responding.', 'ai_timeout', 504)), opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS)
        }
        arm()
        const pump = async (): Promise<void> => {
          const { value, done: finished } = await reader.read()
          if (finished) return done()
          arm()
          for (const e of acc.push(value)) {
            if (e.textDelta) hooks.onTextDelta?.(e.textDelta)
            if (e.reasoningDelta) hooks.onReasoningDelta?.(e.reasoningDelta)
            if (e.toolProgress) hooks.onToolProgress?.(e.toolProgress)
          }
          return pump()
        }
        pump().catch(fail)
      })
    } finally {
      clearTimeout(idle)
      reader.cancel().catch(() => {})
    }
    const r = acc.result()
    if (!r.sawDone && !r.text && !r.toolCalls.length) throw new AgentModelError('The response was cut off before it started. Try again.', 'ai_upstream', 502)
    return { text: r.text, reasoning: r.reasoning, toolCalls: r.toolCalls }
  }
}

function errorCodeFor(status: number, payload: unknown): string {
  const code = (payload as { error?: { code?: unknown } })?.error?.code
  if (typeof code === 'string') return code
  if (status === 401) return 'ai_reauth'
  if (status === 402) return 'ai_credits'
  if (status === 403) return 'ai_scope'
  if (status === 429) return 'ai_rate_limited'
  return 'ai_upstream'
}

/** Message text of an `{ error }` frame or an error body, safe to show. */
export function streamErrorMessage(payload: unknown, fallback = 'The AI request failed.'): string {
  const err = (payload as { error?: unknown })?.error
  if (typeof err === 'string' && err.trim()) return err
  const message = (err as { message?: unknown })?.message ?? (payload as { message?: unknown })?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

type Chunk = { error?: unknown; choices?: { delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] }

/** Incremental parser for OpenAI-style chat SSE: feed any slice of the stream, get the deltas it holds. */
export function createStreamAccumulator() {
  let buffer = ''
  let text = ''
  let reasoning = ''
  let sawDone = false
  const calls: { id?: string; name: string; arguments: string }[] = []
  type Event = { textDelta?: string; reasoningDelta?: string; toolProgress?: { index: number; name: string; bytes: number; arguments: string } }
  return {
    push(part: string): Event[] {
      buffer += part
      const out: Event[] = []
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data) continue
        if (data === '[DONE]') { sawDone = true; continue }
        let chunk: Chunk
        try { chunk = JSON.parse(data) } catch { continue }
        if (chunk.error) {
          const code = (chunk.error as { code?: unknown })?.code
          throw new AgentModelError(streamErrorMessage(chunk), typeof code === 'string' ? code : 'ai_upstream')
        }
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue
        if (typeof delta.content === 'string' && delta.content) { text += delta.content; out.push({ textDelta: delta.content }) }
        const r = typeof delta.reasoning === 'string' ? delta.reasoning : typeof delta.reasoning_content === 'string' ? delta.reasoning_content : ''
        if (r) { reasoning += r; out.push({ reasoningDelta: r }) }
        for (const tc of delta.tool_calls ?? []) {
          // Providers may omit `index` on the first fragment; keep appending to the call in flight.
          const i = typeof tc.index === 'number' ? tc.index : Math.max(0, calls.length - 1)
          const call = (calls[i] ??= { name: '', arguments: '' })
          if (tc.id) call.id = tc.id
          if (tc.function?.name) call.name += tc.function.name
          if (tc.function?.arguments) {
            call.arguments += tc.function.arguments
            out.push({ toolProgress: { index: i, name: call.name, bytes: call.arguments.length, arguments: call.arguments } })
          }
        }
      }
      return out
    },
    result() {
      return {
        text, reasoning, sawDone,
        toolCalls: calls.filter(c => c && c.name).map((c, i) => ({ id: c.id ?? `call_${i}`, name: c.name, arguments: c.arguments })),
      }
    },
  }
}
