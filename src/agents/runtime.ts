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

import { runAgentLoop, type LoopTool } from './loop'
import type { AgentProfile, CallModel, ChatMessage, ToolCall, ToolRun } from './types'

export type SessionStatus = 'running' | 'done' | 'error' | 'stopped'

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
  profiles: () => AgentProfile[]
  /** The tools a child of `profile` may call (the runtime adds `report_to_parent`). */
  childTools: (ctx: ChildRunContext) => LoopTool[]
  /** Run one of the child's tools. */
  execChildTool: (call: ToolCall, ctx: ChildRunContext) => Promise<ToolRun>
  /** The child's system prompt (the profile's instructions plus the host's context). */
  childSystemPrompt: (ctx: ChildRunContext) => string
  store?: SessionStore
  /** Live progress of a child (its tool calls), for the host's UI. */
  onChildEvent?: (event: { sessionId: string; type: 'tool-start' | 'tool-end' | 'text'; name?: string; ok?: boolean; summary?: string; delta?: string }) => void
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
      description: 'Send the main agent a progress update or a question while you keep working. It arrives between its steps; it can answer with a message you read at your next step. Your final answer still goes back by itself when you finish.',
      parameters: { type: 'object', properties: { message: { type: 'string', description: 'What to tell the main agent.' } }, required: ['message'] },
    },
  },
}

export class AgentRuntime {
  private sessions = new Map<string, AgentSession>()
  private controllers = new Map<string, AbortController>()
  private parentQueue: string[] = []
  private loaded: Promise<void> | null = null

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

  list(): AgentSession[] {
    return [...this.sessions.values()].sort((a, b) => a.startedAt - b.startedAt)
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id)
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
    }
    this.sessions.set(session.id, session)
    this.changed()
    const run = this.run(session, profile, prompt, req.readOnly === true, req.signal, true)
    if (background) { void run; return { kind: 'started', id: session.id } }
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
    const run = this.run(session, profile, text, false, opts.signal, false)
    if (!opts.wait) { void run; return { kind: 'resumed', id } }
    const out = await run
    return { kind: 'done', id, ok: out.ok, summary: out.summary }
  }

  /** Stop one child. */
  stop(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session || session.status !== 'running') return false
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

  /** A child's report to the parent (also what `report_to_parent` does). */
  report(fromId: string, text: string): void {
    const s = this.sessions.get(fromId)
    this.parentQueue.push(`Report from agent ${fromId}${s ? ` (${s.profile})` : ''}:\n${text}\n(Answer with send_message if it needs a reply.)`)
    this.changed()
  }

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
        callModel: this.host.callModel,
        signal: controller.signal,
        maxRounds: profile.maxRounds || this.host.maxRounds || 30,
        drainNotifications: () => session.inbox.splice(0, session.inbox.length).map(t => `Message from the main agent:\n${t}`),
        execTool: async call => {
          if (call.name === REPORT_TOOL) {
            let message = ''
            try { message = String((JSON.parse(call.argsText || '{}') as { message?: unknown }).message ?? '') } catch { /* empty */ }
            this.report(session.id, message)
            return { ...call, ok: true, summary: 'reported', content: JSON.stringify({ ok: true }) }
          }
          return this.host.execChildTool(call, ctx)
        },
        hooks: {
          onToolStart: c => this.host.onChildEvent?.({ sessionId: session.id, type: 'tool-start', name: c.name }),
          onToolEnd: r => this.host.onChildEvent?.({ sessionId: session.id, type: 'tool-end', name: r.name, ok: r.ok, summary: r.summary }),
          onTextDelta: d => this.host.onChildEvent?.({ sessionId: session.id, type: 'text', delta: d }),
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
    this.persist(session)
    return { ok, summary, rounds }
  }

  private now() { return this.host.now?.() ?? Date.now() }
  private changed() { this.host.onChange?.() }
  private persist(s: AgentSession) {
    this.changed()
    void this.host.store?.save(s).catch(() => {})
  }
}
