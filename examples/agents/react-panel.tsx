// A panel for an app's agents: each one's type, status and last answer, with Stop and Message.
// Drop into any React app; `runtime` is the app's AgentRuntime.

import { useState } from 'react'
import type { AgentRuntime } from '../../src/agents'
import { useAgents } from '../../src/agents/react'

export function AgentsPanel({ runtime }: { runtime: AgentRuntime }) {
  const agents = useAgents(runtime)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  if (!agents.length) return <p>No agents yet.</p>
  return (
    <ul>
      {agents.map(a => (
        <li key={a.id}>
          <strong>{a.profile}</strong> — {a.description} <em>({a.status})</em>
          {a.summary && <p>{a.summary}</p>}
          {(a.status === 'running' || a.status === 'queued') && <button onClick={() => runtime.stop(a.id)}>Stop</button>}
          <form onSubmit={e => {
            e.preventDefault()
            const text = drafts[a.id]?.trim()
            if (!text) return
            // Running: it reads this at its next step. Finished: it resumes with its whole context.
            void runtime.message(a.id, text)
            setDrafts(d => ({ ...d, [a.id]: '' }))
          }}>
            <input value={drafts[a.id] ?? ''} onChange={e => setDrafts(d => ({ ...d, [a.id]: e.target.value }))} placeholder="Message this agent" />
          </form>
        </li>
      ))}
    </ul>
  )
}
