# Agent examples

Each runs offline with a scripted model, or against Hypery when `HYPERY_TOKEN` is set
(`HYPERY_MODEL`, `HYPERY_TEAM` optional).

| Example | Shows |
|---|---|
| `basic.ts` | The loop alone: tools, `requireAction`, hooks. |
| `orchestrator.ts` | A main agent with explorer and builder agents (one in the background), the plan, events, notifications. |
| `supervised.ts` | Build → review → fix until it passes (`runSupervised`). |
| `persistent.ts` | A run that resumes after a crash (run it twice). |
| `node-host.ts` | Agents on disk that are still there after a restart, and continue with their context. |
| `react-panel.tsx` | A panel listing agents with Stop and Message (`useAgents`). |

```sh
bun examples/agents/orchestrator.ts
HYPERY_TOKEN=… bun examples/agents/orchestrator.ts
```

Full guide: [`docs/AGENTS.md`](../../docs/AGENTS.md).
