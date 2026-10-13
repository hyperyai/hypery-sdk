// The supervisor loop in code, not only in the prompt: build → review → fix → review again, until the reviewer passes
// it or the rounds run out (Cursor / Claude Code style "keep going until it's done and checked"). Uses the runtime's
// agents, so the builder keeps its context across fixes (send_message), and the parent sees one result.

import type { LoopTool } from './loop.js'
import type { AgentRuntime } from './runtime.js'
import type { ToolCall, ToolRun } from './types.js'

export interface SupervisedTask {
  /** What to build, self-contained (the agents can't see the parent's conversation). */
  request: string
  /** What "done" means: acceptance criteria the reviewer checks. Defaults to the request. */
  criteria?: string
  builder?: string
  reviewer?: string
  /** Review rounds before giving up. Default 3. */
  maxReviews?: number
  signal?: AbortSignal
  onEvent?: (e: { phase: 'build' | 'review' | 'fix'; round: number; agentId?: string; verdict?: 'pass' | 'fail'; text?: string }) => void
}

export interface SupervisedResult {
  passed: boolean
  reviews: number
  builderId: string
  /** The builder's last report. */
  report: string
  /** The reviewer's last verdict text. */
  review: string
}

/** PASS or FAIL from a reviewer's answer (its first line); anything else counts as FAIL. */
export function verdictOf(text: string): 'pass' | 'fail' {
  const first = text.trim().split('\n')[0]?.toUpperCase() ?? ''
  return /\bPASS\b/.test(first) && !/\bFAIL\b/.test(first) ? 'pass' : 'fail'
}

export async function runSupervised(runtime: AgentRuntime, task: SupervisedTask): Promise<SupervisedResult> {
  const builder = task.builder ?? 'builder'
  const reviewer = task.reviewer ?? 'reviewer'
  const maxReviews = Math.max(1, task.maxReviews ?? 3)
  task.onEvent?.({ phase: 'build', round: 0 })
  const built = await runtime.spawn({ profileId: builder, prompt: task.request, description: 'Build', signal: task.signal })
  if (built.kind !== 'done') return { passed: false, reviews: 0, builderId: built.kind === 'started' ? built.id : '', report: built.kind === 'refused' ? built.reason : '', review: '' }
  let report = built.summary
  let review = ''
  for (let round = 1; round <= maxReviews; round++) {
    if (task.signal?.aborted) break
    const checked = await runtime.spawn({
      profileId: reviewer,
      description: `Review ${round}`,
      signal: task.signal,
      prompt: [
        `Check this work. Look at the actual result, not only the report.`,
        `Request:\n${task.request}`,
        `Acceptance criteria:\n${task.criteria ?? task.request}`,
        `The builder's report:\n${report}`,
        `Answer PASS or FAIL on the first line; for FAIL, a numbered list of specific fixes.`,
      ].join('\n\n'),
    })
    review = checked.kind === 'done' ? checked.summary : checked.kind === 'refused' ? checked.reason : ''
    const verdict = verdictOf(review)
    task.onEvent?.({ phase: 'review', round, agentId: checked.kind === 'done' ? checked.id : undefined, verdict, text: review })
    if (verdict === 'pass') return { passed: true, reviews: round, builderId: built.id, report, review }
    if (round === maxReviews) break
    task.onEvent?.({ phase: 'fix', round, agentId: built.id })
    const fixed = await runtime.message(built.id, `The review failed. Fix these, check your work, and report what you changed:\n${review}`, { wait: true, signal: task.signal })
    if (fixed.kind === 'done') report = fixed.summary
  }
  return { passed: false, reviews: maxReviews, builderId: built.id, report, review }
}

export const SUPERVISE_TOOL = 'build_and_review'

/** The supervisor as a parent tool: hand it a change and its acceptance criteria; it builds, reviews and fixes. */
export const superviseTool: LoopTool = {
  readOnly: false,
  acts: true,
  spec: {
    type: 'function',
    function: {
      name: SUPERVISE_TOOL,
      description: 'Have a builder agent make a change and a reviewer agent check it against the acceptance criteria, fixing and re-reviewing until it passes (up to 3 reviews). Returns PASS/FAIL, the builder\'s report and the last review. The agents cannot see this conversation: make the request self-contained.',
      parameters: {
        type: 'object',
        properties: {
          request: { type: 'string', description: 'The change, self-contained (scope, goal, constraints).' },
          criteria: { type: 'string', description: 'What done means, checkably.' },
          builder: { type: 'string', description: 'Agent type that builds (default builder).' },
          max_reviews: { type: 'number' },
        },
        required: ['request'],
      },
    },
  },
}

export async function execSuperviseTool(runtime: AgentRuntime, call: ToolCall, opts: { signal?: AbortSignal } = {}): Promise<ToolRun> {
  let args: { request?: string; criteria?: string; builder?: string; max_reviews?: number } = {}
  try { args = JSON.parse(call.argsText || '{}') } catch { /* below */ }
  if (!args.request) return { ...call, ok: false, summary: 'missing request', content: JSON.stringify({ error: 'A request is required.' }) }
  const r = await runSupervised(runtime, { request: args.request, criteria: args.criteria, builder: args.builder, maxReviews: args.max_reviews, signal: opts.signal })
  return {
    ...call, ok: true, summary: `${r.passed ? 'PASS' : 'FAIL'} after ${r.reviews} review${r.reviews === 1 ? '' : 's'}`,
    content: JSON.stringify({ passed: r.passed, reviews: r.reviews, builder_id: r.builderId, report: r.report, review: r.review }),
  }
}
