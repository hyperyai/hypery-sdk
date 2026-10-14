// @hyperyai/sdk/agents. The agent core — the loop, the runtime of addressable agents, the orchestration tools, agent
// types, the supervisor, plans, stores, persistent runs and the Hypery model call — is written once in Tish
// (tish/agents) and compiled here to JavaScript with its TypeScript declarations; Dune's cloud agents run the same
// source natively. This file adds what only a JavaScript host has: IndexedDB, and the platform's `fetch`.

import { createHyperyModel as createCoreModel, type HyperyModelOptions as CoreModelOptions } from './core/hypery-model.js'
import { createAgentRuntime as createCoreRuntime, type AgentHost, type AgentRuntime, type ChildRunContext } from './core/runtime.js'
import type { ToolCall, ToolRun } from './core/types.js'
import type { CallModel } from './core/types.js'

export * from './core/index.js'
export { indexedDbStore } from './indexeddb.js'

/** `createHyperyModel`'s options; `fetch` defaults to the platform's. */
export type HyperyModelOptions = Omit<CoreModelOptions, 'fetch'> & { fetch?: typeof fetch }

/** The model call for Hypery's gateway (see the core's `createHyperyModel`), on the platform's `fetch` by default. */
export function createHyperyModel(opts: HyperyModelOptions): CallModel {
  return createCoreModel({ ...opts, fetch: opts.fetch ?? ((url: string, init: RequestInit) => fetch(url, init)) })
}

/**
 * The agent runtime (see the core's `createAgentRuntime`), with each child's `ctx.signal` a real `AbortSignal` by
 * default: tools and the model call can hand it to `fetch` or listen for `abort`, and stopping a child cancels its
 * requests in flight. A host's own `createSignal` wins.
 */
export function createAgentRuntime(host: JsAgentHost): AgentRuntime {
  return createCoreRuntime({
    ...host,
    createSignal: host.createSignal ?? (() => {
      const controller = new AbortController()
      return { signal: controller.signal, stop: () => controller.abort() }
    }),
    // The core types a child's signal as anything with `aborted`; here every one comes from `createSignal`, whose
    // signals are AbortSignals — so the host's callbacks may rely on that.
  } as unknown as AgentHost)
}

/** A child's context in a JavaScript host: its `signal` is an `AbortSignal`. */
export type JsChildRunContext = Omit<ChildRunContext, 'signal'> & { signal: AbortSignal }

/** The host `createAgentRuntime` takes here: the core's, with each child's `signal` an `AbortSignal`. */
export type JsAgentHost = Omit<AgentHost, 'childModel' | 'childTools' | 'execChildTool' | 'childSystemPrompt' | 'createSignal'> & {
  childModel?: ((ctx: JsChildRunContext) => CallModel | null | undefined) | null
  childTools: (ctx: JsChildRunContext) => ReturnType<AgentHost['childTools']>
  execChildTool: (call: ToolCall, ctx: JsChildRunContext) => Promise<ToolRun>
  childSystemPrompt: (ctx: JsChildRunContext) => string | Promise<string>
  /** Each child's stop signal; default an `AbortController`'s. */
  createSignal?: (() => { signal: AbortSignal; stop: () => void }) | null
}
