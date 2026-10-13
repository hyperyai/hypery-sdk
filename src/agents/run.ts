// A main-agent run that survives reloads, crashes and sleeping devices: every round is checkpointed to a RunStore,
// and a run that was cut off is continued from its last checkpoint (`resumeRun`). The foundation for server-side
// runs too — any process holding the store can continue one.

import { runAgentLoop, type LoopOptions, type LoopOutcome } from './loop.js'
import type { AgentRunRecord, RunStore } from './store.js'
import type { TodoList } from './todos.js'

export interface PersistentRunOptions extends LoopOptions {
  /** The run's id (the host's conversation or turn id). */
  id: string
  runs: RunStore
  /** Its plan, saved with each checkpoint. */
  todos?: TodoList
  meta?: Record<string, unknown>
  now?: () => number
}

/** Run (or continue) a loop, checkpointing every round. */
export async function runPersistent(opts: PersistentRunOptions): Promise<LoopOutcome> {
  const now = opts.now ?? Date.now
  const existing = await opts.runs.get(opts.id)
  const createdAt = existing?.createdAt ?? now()
  const record = (patch: Partial<AgentRunRecord> & Pick<AgentRunRecord, 'checkpoint' | 'status'>): AgentRunRecord => ({
    id: opts.id, createdAt, updatedAt: now(), meta: opts.meta ?? existing?.meta, todos: opts.todos?.get() ?? existing?.todos, ...patch,
  })
  await opts.runs.save(record({ status: 'running', checkpoint: existing?.checkpoint ?? { messages: opts.messages, round: 0, acted: false, nudgesLeft: 0, done: false } }))
  try {
    const outcome = await runAgentLoop({
      ...opts,
      checkpoint: async state => {
        await opts.runs.save(record({ status: state.done ? 'done' : 'running', checkpoint: state }))
        await opts.checkpoint?.(state)
      },
    })
    if (outcome.stopped) {
      const saved = await opts.runs.get(opts.id)
      if (saved) await opts.runs.save({ ...saved, status: 'stopped', updatedAt: now() })
    }
    return outcome
  } catch (err) {
    const saved = await opts.runs.get(opts.id)
    if (saved) await opts.runs.save({ ...saved, status: 'error', error: (err as Error)?.message ?? String(err), updatedAt: now() })
    throw err
  }
}

/** Runs left "running" by a process that is gone: what to offer to continue after a reload. */
export async function interruptedRuns(runs: RunStore, activeIds: Iterable<string> = []): Promise<AgentRunRecord[]> {
  const active = new Set(activeIds)
  return (await runs.list()).filter(r => r.status === 'running' && !active.has(r.id))
}

/**
 * Continue a run from its last checkpoint. `options` supplies what can't be saved (the model call, the tools and
 * how to run them); messages and loop state come from the store, and calls the interruption cut off are answered as
 * interrupted so the model can check and redo them.
 */
export async function resumeRun(id: string, runs: RunStore, options: Omit<PersistentRunOptions, 'id' | 'runs' | 'messages'>): Promise<LoopOutcome> {
  const saved = await runs.get(id)
  if (!saved) throw new Error(`No saved run "${id}".`)
  const cp = saved.checkpoint
  return runPersistent({
    ...options,
    id,
    runs,
    messages: [...cp.messages, { role: 'user', content: 'The session was interrupted and has resumed. Check the state of your work, then carry on where you left off.' }],
    resumeState: { round: cp.round, acted: cp.acted, nudgesLeft: cp.nudgesLeft },
    meta: options.meta ?? saved.meta,
  })
}
