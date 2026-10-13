// The agent core's vocabulary: OpenAI-style chat messages and tool specs (what Hypery's gateway speaks), and the
// tools and profiles a host plugs in. Nothing here knows about a product — PopCraft, Dune and Hypery each supply
// their own tools, prompts, model call and storage.

export interface ChatContentPart {
  type: string
  text?: string
  image_url?: { url: string }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ChatContentPart[]
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  name?: string
}

export interface ChatToolSpec {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

/** One assistant turn as the host's model call returns it. */
export interface ModelTurn {
  text: string
  reasoning?: string
  toolCalls: { id: string; name: string; arguments: string }[]
}

export interface ModelHooks {
  onTextDelta?: (delta: string) => void
  onReasoningDelta?: (delta: string) => void
  /** A tool call's arguments are still streaming in (what has arrived so far). */
  onToolProgress?: (p: { index: number; name: string; bytes: number; arguments: string }) => void
}

/** The host's model call: one streamed assistant turn. */
export type CallModel = (messages: ChatMessage[], tools: ChatToolSpec[], hooks: ModelHooks, signal?: AbortSignal) => Promise<ModelTurn>

export interface ToolCall {
  id: string
  name: string
  argsText: string
}

export interface ToolRun extends ToolCall {
  ok: boolean
  summary: string
  /** Serialized result handed back to the model. */
  content: string
  /** Images to show the model after the round (e.g. a render), as data or https URLs. */
  images?: string[]
  /** Whether this call changed something, when that depends on the call (delegating to an agent that can make changes). Overrides the tool's `acts`. */
  acted?: boolean
}

/**
 * An agent type (Claude Code's subagent types, Dune's profiles): its instructions, the tools it may call, the model
 * it runs on, and how long it may go.
 */
export interface AgentProfile {
  id: string
  /** One line for the model choosing whom to delegate to. */
  description: string
  /** The child's system prompt (the host may add its own context after it). */
  instructions: string
  /** Tool names this type may call; `['*']` for every tool the host offers children. */
  tools: string[]
  /** Never edits: only read-only tools, whatever `tools` says. */
  readOnly?: boolean
  /** A model id, `'inherit'` (the parent's), or `'fast'` (the host's cheapest tool-capable model). */
  model?: string
  /** Round budget; 0 or absent means the core default. */
  maxRounds?: number
  /** Runs in the background unless the call says otherwise. */
  background?: boolean
}
