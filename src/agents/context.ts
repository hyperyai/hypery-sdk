// Keeping a long session inside the model's request: the whole transcript is re-sent every round, so a session that
// renders, reads and edits for an hour outgrows the request limit (Hypery's host: 4.5 MB) and the model's context.
//
// - pruneOldImages: older rendered views are superseded by newer ones — keep the latest few.
// - fitImagesToBudget: drop rendered views (oldest first) until the request fits.
// - compactTranscript: replace the middle of a long transcript with a summary (Claude Code's compaction), keeping the
//   system prompt, the first request and the latest turns; tool calls are never split from their results.

import type { CallModel, ChatMessage } from './types.js'

const RENDER_TURN_PREFIX = 'Result of '
export const KEEP_IMAGE_TURNS = 2
const sizeOf = (messages: ChatMessage[]) => JSON.stringify(messages).length
const isRenderTurn = (m: ChatMessage) =>
  m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'text' && !!m.content[0].text?.startsWith(RENDER_TURN_PREFIX)

/** Keep the pixels of the latest `keep` rendered-view turns; earlier ones become a note. Images a user sent stay. */
export function pruneOldImages(messages: ChatMessage[], keep = KEEP_IMAGE_TURNS): void {
  let seen = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (!isRenderTurn(m) || !Array.isArray(m.content) || !m.content.some(p => p.type === 'image_url')) continue
    if (++seen <= keep) continue
    const images = m.content.filter(p => p.type === 'image_url').length
    const text = m.content.flatMap(p => (p.type === 'text' && p.text ? [p.text] : [])).join(' ')
    messages[i] = { ...m, content: `${text} [${images === 1 ? 'image' : `${images} images`} omitted: superseded by a later view.]`.trim() }
  }
}

/** Drop rendered views, oldest first, until the transcript fits `budget` characters. */
export function fitImagesToBudget(messages: ChatMessage[], budget: number): void {
  if (sizeOf(messages) <= budget) return
  for (let i = 0; i < messages.length && sizeOf(messages) > budget; i++) {
    const m = messages[i]
    if (!isRenderTurn(m) || !Array.isArray(m.content)) continue
    const parts = [...m.content]
    let dropped = 0
    for (let j = parts.length - 1; j >= 0 && sizeOf(messages) > budget; j--) {
      if (parts[j].type !== 'image_url') continue
      parts.splice(j, 1)
      dropped++
      messages[i] = { ...m, content: [...parts] }
    }
    if (dropped) {
      const note = `[${dropped === 1 ? '1 image' : `${dropped} images`} omitted to keep the request under the size limit.]`
      messages[i] = { ...m, content: `${parts.flatMap(p => (p.type === 'text' && p.text ? [p.text] : [])).join(' ')} ${note}`.trim() }
    }
  }
}

export interface CompactOptions {
  /** Compact when the transcript is longer than this many characters. */
  maxChars: number
  /** Turns kept verbatim at the end. Default 12 messages. */
  keepRecent?: number
  /** Summarises the dropped middle (a model call). Absent: the middle is dropped with a note. */
  summarize?: (dropped: ChatMessage[]) => Promise<string>
}

/** Index where the kept tail can start without separating a tool call from its results. */
function safeTailStart(messages: ChatMessage[], want: number): number {
  let i = Math.max(1, messages.length - want)
  while (i < messages.length && messages[i].role === 'tool') i++
  return i
}

/** Compact a long transcript in place: system + first request + summary + recent turns. Returns whether it did. */
export async function compactTranscript(messages: ChatMessage[], opts: CompactOptions): Promise<boolean> {
  if (sizeOf(messages) <= opts.maxChars) return false
  const head = messages[0]?.role === 'system' ? 1 : 0
  const firstUser = messages.findIndex((m, i) => i >= head && m.role === 'user')
  const keepFrom = firstUser >= 0 ? firstUser + 1 : head
  const tail = safeTailStart(messages, opts.keepRecent ?? 12)
  if (tail <= keepFrom) return false
  const dropped = messages.slice(keepFrom, tail)
  const summary = opts.summarize ? await opts.summarize(dropped).catch(() => '') : ''
  const note: ChatMessage = {
    role: 'user',
    content: summary
      ? `Summary of the earlier work in this session (the details were compacted to save space):\n${summary}`
      : `[${dropped.length} earlier messages were compacted to save space. Look again at anything you need from them.]`,
  }
  messages.splice(keepFrom, dropped.length, note)
  return true
}

/** A `summarize` for compactTranscript built on the host's model call. */
export function modelSummarizer(callModel: CallModel): (dropped: ChatMessage[]) => Promise<string> {
  return async dropped => {
    const text = dropped
      .map(m => `${m.role}${m.name ? ` (${m.name})` : ''}: ${typeof m.content === 'string' ? m.content : m.content.flatMap(p => (p.type === 'text' && p.text ? [p.text] : [])).join(' ')}`)
      .join('\n')
      .slice(0, 60_000)
    const out = await callModel([
      { role: 'system', content: 'Summarise this agent work log for the agent itself to continue from: what was asked, what was done (with ids and names), what was found, what is left. Be specific and brief.' },
      { role: 'user', content: text },
    ], [], {})
    return out.text.trim()
  }
}
