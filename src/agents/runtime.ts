// The agent runtime: a parent agent's children as addressable sessions (Claude Code's agents, Cursor's background
// agents, dune's task jobs — with what dune left out).
//
// - Every child is a session with an id, its transcript and an inbox, foreground or background.
// - The parent can message a running child (it reads the message at its next round), resume a finished one with its
//   whole context, stop one, and list them.
// - A child can report to the parent mid-run (progress, a question); reports and finished background children are
//   queued and reach the parent between its rounds (`drainParentNotifications`).
// - Sessions go through the host's `store`, so a host that persists them gets them back after a reload.
//
// Host-agnostic: the host supplies the model call, its profiles, the tools a child may use and how to run them, and
// the child's system prompt. Children cannot spawn children (depth 1, as in dune and Claude Code).

import { runAgentLoop, type LoopTool } from './loop.js'
import type { AgentProfile, CallModel, ChatMessage, ToolCall, ToolRun } from './types.js'

export type SessionStatus = 'queued' | 'running' | 'done' | 'error' | 'stopped'

/** What the host's UI can follow: one stream for every agent. */
export type AgentEvent =
  | { type: 'session'; sessionId: string; status: SessionStatus; profile: string; description: string }
  | { type: 'tool-start'; sessionId: string; name: string }
  | { type: 'tool-end'; sessionId: string; name: string; ok: boolean; summary: string }
  | { type: 'text'; sessionId: string; delta: string }
  | { type: 'report'; sessionId: string; message: string; question: boolean }
  | { type: 'nudge'; sessionId: string; message: string }

export interface AgentSession {
  id: string
  profile: string
  description: string
  status: SessionStatus
  background: boolean
  /** The child's last answer. */
  summary?: string
  transcript: ChatMessage[]
  /** Parent messages waiting for the child's next round. */
  inbox: string[]
  startedAt: number
  endedAt?: number
  rounds: number
  /** Limited to read-only tools: its work changes nothing. */
  readOnly?: boolean
  /** The parent's tool call that started it (`task`), so a UI can nest its progress under that call. */
  parentCallId?: string
}

/** Where sessions are kept between reloads (the host's choice: IndexedDB, a file, a database). Optional. */
export interface SessionStore {
  load(): Promise<AgentSession[]>
  save(session: AgentSession): Promise<void>
  remove?(id: string): Promise<void>
}

export interface ChildRunContext {
  session: AgentSession
  profile: AgentProfile
  readOnly: boolean
  signal: AbortSignal
}

export interface AgentHost {
  callModel: CallModel
  /**
   * The model call for one child, from its profile's `model` (`'inherit'`, `'fast'` or an id): a host that runs
   * read-only surveys on a cheaper model returns that here. Absent, or `undefined` returned, = `callModel`.
   */
  childModel?: (ctx: ChildRunContext) => CallModel | undefined
  profiles: () => AgentProfile[]
  /** The tools a child of `profile` may call (the runtime adds `report_to_parent`). */
  childTools: (ctx: ChildRunContext) => LoopTool[]
  /** Run one of the child's tools. */
  execChildTool: (call: ToolCall, ctx: ChildRunContext) => Promise<ToolRun>
  /** The child's system prompt (the profile's instructions plus the host's context). */
  childSystemPrompt: (ctx: ChildRunContext) => string
  store?: SessionStore
  /** Every agent's progress, for the host's UI. */
  onEvent?: (event: AgentEvent) => void
  /** Background agents running at once; more wait as 'queued'. Default 4. */
  maxConcurrent?: number
  /** Sessions changed (spawned, finished, messaged, stopped). */
  onChange?: () => void
  /** Default child round budget. */
  maxRounds?: number
  now?: () => number
  newId?: () => string
}

export interface SpawnRequest {
  profileId: string
  prompt: string
  description?: string
  background?: boolean
  readOnly?: boolean
  /** Stops the child too when it aborts (the parent's Stop). */
  signal?: AbortSignal
  /** The parent's tool call starting it, kept on the session (see `AgentSession.parentCallId`). */
  parentCallId?: string
}

export type SpawnResult =
  | { kind: 'done'; id: string; ok: boolean; summary: string; rounds: number }
  | { kind: 'started'; id: string }
  | { kind: 'refused'; reason: string }

export const REPORT_TOOL = 'report_to_parent'

const reportSpec: LoopTool = {
  readOnly: true,
  acts: false,
  spec: {
    type: 'function',
    function: {
      name: REPORT_TOOL,
      description: 'Send the main agent a progress update, or a question (set question) when you need a decision you cannot make yourself. It arrives between its steps and it answers with a message you read at your next step — keep working on what you can meanwhile. Your final answer still goes back by itself when you finish.',
      parameters: { type: 'object', properties: { message: { type: 'string', description: 'What to tell the main agent.' }, question: { type: 'boolean', description: 'This needs an answer.' } }, required: ['message'] },
    },
  },
}

export class AgentRuntime {
  private sessions = new Map<string, AgentSession>()
  private controllers = new Map<string, AbortController>()
  private parentQueue: string[] = []
  private loaded: Promise<void> | null = null
  private waiting: (() => void)[] = []
  /** Background slots taken (claimed synchronously, so spawns in a row can't all slip past the limit). */
  private activeBackground = 0
  private listeners = new Set<() => void>()
  private pendingSaves = new Set<Promise<void>>()

  constructor(private host: AgentHost) {}

  /** Bring back the store's sessions (any left "running" by a reload are marked stopped: their run is gone). */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      for (const s of (await this.host.store?.load()) ?? []) {
        if (s.status === 'running') Object.assign(s, { status: 'stopped', endedAt: s.endedAt ?? this.now() })
        this.sessions.set(s.id, s)
      }
      this.changed()
    })()
    return this.loaded
  }

  /** Wait until every session change has reached the store (before a process exits or a page unloads). */
  async flush(): Promise<void> {
    while (this.pendingSaves.size) await Promise.all([...this.pendingSaves])
  }

  /** Called whenever sessions change (spawned, queued, finished, messaged, stopped). Returns the unsubscribe. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  list(): AgentSession[] {
    return [...this.sessions.values()].sort((a, b) => a.startedAt - b.startedAt)
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id)
  }

  /**
   * Resolves once the agent is no longer queued or running, or when `timeoutMs` passes or `signal` aborts (then with
   * the session as it is). `undefined` for an unknown id.
   */
  wait(id: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<AgentSession | undefined> {
    const busy = (s: AgentSession | undefined) => s?.status === 'running' || s?.status === 'queued'
    if (!busy(this.get(id))) return Promise.resolve(this.get(id))
    return new Promise(resolve => {
      const finish = () => { unsubscribe(); clearTimeout(timer); opts.signal?.removeEventListener('abort', finish); resolve(this.get(id)) }
      const unsubscribe = this.subscribe(() => { if (!busy(this.get(id))) finish() })
      const timer = setTimeout(finish, opts.timeoutMs ?? 120_000)
      opts.signal?.addEventListener('abort', finish, { once: true })
    })
  }

  /** Drop the queued "finished" notice for `id`: the parent already has its answer (await_agent handed it over). */
  dismissFinished(id: string): void {
    for (let i = this.parentQueue.length - 1; i >= 0; i--) if (this.parentQueue[i].startsWith(`Agent ${id} (`)) this.parentQueue.splice(i, 1)
  }

  /** Everything queued for the parent (reports, finished background children), taken. */
  drainParentNotifications(): string[] {
    return this.parentQueue.splice(0, this.parentQueue.length)
  }

  hasPendingNotifications(): boolean {
    return this.parentQueue.length > 0
  }

  async spawn(req: SpawnRequest): Promise<SpawnResult> {
    const profile = this.host.profiles().find(p => p.id === req.profileId)
    if (!profile) return { kind: 'refused', reason: `No agent type "${req.profileId}". Available: ${this.host.profiles().map(p => p.id).join(', ')}.` }
    const prompt = req.prompt?.trim()
    if (!prompt) return { kind: 'refused', reason: 'A task needs a self-contained prompt — the agent cannot see this conversation.' }
    const background = req.background ?? profile.background ?? false
    const session: AgentSession = {
      id: this.host.newId?.() ?? `agent-${this.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      profile: profile.id,
      description: req.description ?? prompt.slice(0, 80),
      status: 'running',
      background,
      transcript: [],
      inbox: [],
      startedAt: this.now(),
      rounds: 0,
      readOnly: req.readOnly === true || profile.readOnly === true,
      ...(req.parentCallId ? { parentCallId: req.parentCallId } : {}),
    }
    this.sessions.set(session.id, session)
    this.changed()
    this.emit({ type: 'session', sessionId: session.id, status: 'running', profile: session.profile, description: session.description })
    if (background) {
      void this.slot(session)
        .then(async () => {
          try { if (session.status !== 'stopped') await this.run(session, profile, prompt, req.readOnly === true, req.signal, true) } finally { this.release() }
        })
        .catch(() => {})
      return { kind: 'started', id: session.id }
    }
    const run = this.run(session, profile, prompt, req.readOnly === true, req.signal, true)
    const out = await run
    return { kind: 'done', id: session.id, ok: out.ok, summary: out.summary, rounds: out.rounds }
  }

  /**
   * Message a child. Running: queued for its next round. Finished: resumed with its whole context and this message —
   * in the background (its answer reaches the parent as a notification) unless `wait` is set.
   */
  async message(id: string, text: string, opts: { wait?: boolean; signal?: AbortSignal } = {}): Promise<
    { kind: 'queued'; id: string } | { kind: 'resumed'; id: string } | { kind: 'done'; id: string; ok: boolean; summary: string } | { kind: 'unknown'; id: string }
  > {
    await this.load()
    const session = this.sessions.get(id)
    if (!session) return { kind: 'unknown', id }
    if (session.status === 'running') {
      session.inbox.push(text)
      this.persist(session)
      return { kind: 'queued', id }
    }
    const profile = this.host.profiles().find(p => p.id === session.profile)
    if (!profile) return { kind: 'unknown', id }
    Object.assign(session, { status: 'running', endedAt: undefined, background: !opts.wait })
    this.changed()
    if (!opts.wait) {
      void this.slot(session)
        .then(async () => { try { if (session.status !== 'stopped') await this.run(session, profile, text, false, opts.signal, false) } finally { this.release() } })
        .catch(() => {})
      return { kind: 'resumed', id }
    }
    const out = await this.run(session, profile, text, false, opts.signal, false)
    return { kind: 'done', id, ok: out.ok, summary: out.summary }
  }

  /** Stop one child. */
  stop(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session || (session.status !== 'running' && session.status !== 'queued')) return false
    this.controllers.get(id)?.abort()
    Object.assign(session, { status: 'stopped', endedAt: this.now() })
    this.persist(session)
    return true
  }

  /** Stop every running child (the user pressed Stop); their queued notifications are dropped. */
  stopAll(): void {
    for (const s of this.sessions.values()) this.stop(s.id)
    this.parentQueue.length = 0
  }

  /** A child's report to the parent (also what `report_to_parent` does). A question asks for an answer. */
  report(fromId: string, text: string, question = false): void {
    const s = this.sessions.get(fromId)
    const who = `agent ${fromId}${s ? ` (${s.profile})` : ''}`
    this.parentQueue.push(question
      ? `QUESTION from ${who} — it needs your answer (send_message ${fromId}):\n${text}`
      : `Report from ${who}:\n${text}`)
    this.emit({ type: 'report', sessionId: fromId, message: text, question })
    this.changed()
  }

  /** Take a background slot (maxConcurrent); the session shows 'queued' while it waits. */
  private async slot(session: AgentSession): Promise<void> {
    const max = this.host.maxConcurrent ?? 4
    if (this.activeBackground < max) { this.activeBackground++; return }
    session.status = 'queued'
    this.emit({ type: 'session', sessionId: session.id, status: 'queued', profile: session.profile, description: session.description })
    this.changed()
    // The slot is handed over by the run that frees it (see `release`).
    await new Promise<void>(res => this.waiting.push(res))
    if (session.status === 'queued') session.status = 'running'
  }

  /** A background run ended: give its slot to the next queued agent, or free it. */
  private release() {
    const next = this.waiting.shift()
    if (next) next()
    else this.activeBackground = Math.max(0, this.activeBackground - 1)
  }

  private emit(e: AgentEvent) { this.host.onEvent?.(e) }

  private async run(session: AgentSession, profile: AgentProfile, prompt: string, forceReadOnly: boolean, parentSignal: AbortSignal | undefined, fresh: boolean) {
    const controller = new AbortController()
    this.controllers.set(session.id, controller)
    const abort = () => controller.abort()
    if (parentSignal?.aborted) controller.abort()
    else parentSignal?.addEventListener('abort', abort, { once: true })
    const ctx: ChildRunContext = { session, profile, readOnly: forceReadOnly || profile.readOnly === true, signal: controller.signal }
    const tools = [...this.host.childTools(ctx), reportSpec]
    const messages: ChatMessage[] = fresh
      ? [{ role: 'system', content: this.host.childSystemPrompt(ctx) }, { role: 'user', content: prompt }]
      : [...session.transcript, { role: 'user', content: `Message from the main agent:\n${prompt}` }]
    let ok = true
    let summary = ''
    let rounds = 0
    try {
      const outcome = await runAgentLoop({
        messages,
        tools,
        callModel: this.host.childModel?.(ctx) ?? this.host.callModel,
        signal: controller.signal,
        maxRounds: profile.maxRounds || this.host.maxRounds || 30,
        drainNotifications: () => session.inbox.splice(0, session.inbox.length).map(t => `Message from the main agent:\n${t}`),
        execTool: async call => {
          if (call.name === REPORT_TOOL) {
            let args: { message?: unknown; question?: unknown } = {}
            try { args = JSON.parse(call.argsText || '{}') } catch { /* empty */ }
            this.report(session.id, String(args.message ?? ''), args.question === true)
            return { ...call, ok: true, summary: 'reported', content: JSON.stringify({ ok: true }) }
          }
          return this.host.execChildTool(call, ctx)
        },
        // A building agent asked to change something keeps going until it has (read-only types just answer).
        requireAction: fresh && !ctx.readOnly,
        hooks: {
          onToolStart: c => this.emit({ type: 'tool-start', sessionId: session.id, name: c.name }),
          onToolEnd: r => this.emit({ type: 'tool-end', sessionId: session.id, name: r.name, ok: r.ok, summary: r.summary }),
          onTextDelta: d => this.emit({ type: 'text', sessionId: session.id, delta: d }),
          onNudge: m => this.emit({ type: 'nudge', sessionId: session.id, message: m }),
        },
      })
      session.transcript = outcome.messages
      rounds = outcome.rounds
      summary = outcome.text.trim() || (outcome.stopped ? '(stopped)' : '(finished without a summary)')
      ok = !outcome.stopped
    } catch (err) {
      ok = false
      summary = `(agent error: ${(err as Error)?.message ?? String(err)})`
    } finally {
      parentSignal?.removeEventListener('abort', abort)
      this.controllers.delete(session.id)
    }
    session.rounds += rounds
    if (session.status === 'running') Object.assign(session, { status: ok ? 'done' : 'error', summary, endedAt: this.now() })
    else session.summary = summary
    // A background child's answer is queued for the parent; a foreground one went straight back.
    if (session.background && session.status !== 'stopped') {
      this.parentQueue.push(`Agent ${session.id} (${session.profile}) ${ok ? 'finished' : 'failed'}:\n${summary}`)
    }
    this.emit({ type: 'session', sessionId: session.id, status: session.status, profile: session.profile, description: session.description })
    this.persist(session)
    return { ok, summary, rounds }
  }

  private now() { return this.host.now?.() ?? Date.now() }
  private changed() {
    this.host.onChange?.()
    for (const l of this.listeners) l()
  }
  private persist(s: AgentSession) {
    this.changed()
    if (!this.host.store) return
    const p = this.host.store.save(s).catch(() => {})
    this.pendingSaves.add(p)
    void p.finally(() => this.pendingSaves.delete(p))
  }
}
