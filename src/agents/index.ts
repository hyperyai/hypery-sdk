// @hyperyai/sdk/agents. The agent core — the loop, the runtime of addressable agents, the orchestration tools, agent
// types, the supervisor, plans, stores, persistent runs and the Hypery model call — is written once in Tish
// (tish/agents) and compiled here to JavaScript with its TypeScript declarations; Dune's cloud agents run the same
// source natively. This file adds what only a JavaScript host has: IndexedDB, and the platform's `fetch`.

import { createHyperyModel as createCoreModel, type HyperyModelOptions as CoreModelOptions } from './core/hypery-model.js'
import { createAgentRuntime as createCoreRuntime, type AgentHost, type AgentRuntime } from './core/runtime.js'
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
export function createAgentRuntime(host: AgentHost): AgentRuntime {
  return createCoreRuntime({
    ...host,
    createSignal: host.createSignal ?? (() => {
      const controller = new AbortController()
      return { signal: controller.signal, stop: () => controller.abort() }
    }),
  })
}
