// React bindings for an AgentRuntime: the agents list for a panel, re-rendered as agents start, report and finish.
// A separate entry point (`@hyperyai/sdk/agents/react`) so Node and Dune never load React.

import { useMemo, useSyncExternalStore } from 'react'
import type { AgentRuntime, AgentSession } from './runtime.js'

/** The runtime's agents, live. */
export function useAgents(runtime: AgentRuntime): AgentSession[] {
  const subscribe = useMemo(() => (fn: () => void) => runtime.subscribe(fn), [runtime])
  // A new array only when something changed, so React does not loop.
  const snapshot = useMemo(() => {
    let last: AgentSession[] = []
    let key = ''
    return () => {
      const list = runtime.list()
      const next = list.map(s => `${s.id}:${s.status}:${s.rounds}:${s.summary?.length ?? 0}:${s.inbox.length}`).join('|')
      if (next !== key) { key = next; last = list.map(s => ({ ...s })) }
      return last
    }
  }, [runtime])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** One agent, live (undefined until it exists). */
export function useAgent(runtime: AgentRuntime, id: string | null | undefined): AgentSession | undefined {
  return useAgents(runtime).find(s => s.id === id)
}
