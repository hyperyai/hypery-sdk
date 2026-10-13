# Agents — `@hyperyai/sdk/agents`

One agent core for every Hypery app: PopCraft's editor agent, Dune's IDE agent, Hypery's own. It runs the agent loop,
manages agents the main agent can talk to, keeps sessions alive across reloads, and checks its own work. No
framework, no dependencies — your app supplies its tools, its prompts, and (optionally) storage; the Hypery model call
is built in.

| Entry point | For |
|---|---|
| `@hyperyai/sdk/agents` | Everything below. Browser, Node, Dune, workers. |
| `@hyperyai/sdk/agents/node` | Everything, plus `fileStore` (Node `fs`). |
| `@hyperyai/sdk/agents/react` | `useAgents`, `useAgent` hooks. |

Runnable examples: [`examples/agents`](../examples/agents) (they run offline, or against Hypery with `HYPERY_TOKEN`).

---

## The pieces

### 1. The loop — `runAgentLoop`

Assistant turn → tool calls → results → repeat, until the model is done.

- **Parallel reads, ordered edits.** Tools marked `readOnly` in one turn run together (up to `maxParallel`); anything
  else runs alone and in order.
- **Keeps going until it acts** — `requireAction: true`. A turn asked to change something that tries to finish having
  only read is told to act (twice at most), instead of ending after minutes of reading with nothing done. Handing the
  work to an agent that can make changes (`task`, `send_message`) counts as acting; a tool result can say so itself
  with `acted`.
- **Survives a flaky connection.** A stalled or dropped model stream is retried (`modelRetries`, default 2).
- **Notifications between rounds** — `drainNotifications`. Finished background agents, agents' reports and questions,
  and messages for this agent arrive here; one arriving just as the model stops gives it another round.
- **Stays inside the request** — `context`. Older rendered views are dropped (`keepImageTurns`), the request is fitted
  under Hypery's 4.5 MB limit, and a long transcript is compacted (`compact: { maxChars, summarize }`).
- **Checkpoints** — `checkpoint` is called (and awaited) after every round with everything needed to continue.

```ts
const outcome = await runAgentLoop({
  messages, tools, callModel, execTool,
  requireAction: true,
  context: { compact: { maxChars: 600_000, summarize: modelSummarizer(callModel) } },
  hooks: { onTextDelta, onToolStart, onToolEnd, onNudge },
  signal,
})
// outcome: { messages, text, rounds, acted, stopped, exhausted }
```

### 2. The model — `createHyperyModel`

Hypery's gateway (`/api/v1/chat/completions`, streamed), so no app writes its own client.

```ts
const callModel = createHyperyModel({
  token: () => auth.accessToken(),        // the user's Hypery token
  model: () => settings.model,            // e.g. 'anthropic/claude-sonnet-4.5'
  team: () => currentTeamId,              // the team billed (absent = personal)
  paymentSource: () => (appStoreBuild ? 'credits' : null),
})
```

Errors are `AgentModelError` with a message safe to show and a `code`: `ai_reauth`, `ai_credits`, `ai_scope`,
`ai_rate_limited`, `ai_timeout`, `too_large`, `network`, `ai_upstream`. A stream silent for 180 s is ended
(`idleTimeoutMs`).

### 3. Agents the main agent can talk to — `AgentRuntime`

Every agent is a **session**: an id, its transcript, an inbox. The main agent (or your UI) can:

| | |
|---|---|
| `spawn({ profileId, prompt, background })` | Start an agent. Foreground: returns its answer. Background: returns its id at once; the answer arrives as a notification. |
| `message(id, text)` | A **running** agent reads it at its next step (steer it, answer its question). A **finished** one is **resumed with its whole context** (`wait: true` to get the answer now). |
| `stop(id)` / `stopAll()` | Stop one agent, or all (the user pressed Stop). |
| `list()` / `get(id)` | Status, last answer, transcript. |
| `drainParentNotifications()` | Reports, questions and finished background agents, for the main agent's loop. |
| `subscribe(fn)` / `onEvent` | Live updates for a panel. |
| `load()` / `flush()` | Restore sessions from the store / wait for saves. |

Agents can **report** while they work — progress, or a **question** that needs the main agent's answer
(`report_to_parent`, `question: true`). Background agents beyond `maxConcurrent` (default 4) wait as `queued`.
Agents can't start agents of their own (depth 1).

```ts
const runtime = new AgentRuntime({
  callModel,
  profiles: () => mergeProfiles(BUILTIN_PROFILES, myProfiles),
  childTools: ctx => myTools({ readOnly: ctx.readOnly }),            // LoopTool[]
  execChildTool: (call, ctx) => runMyTool(call, ctx.signal),
  childSystemPrompt: ctx => `${ctx.profile.instructions}\n\n${myContext()}`,
  store: sessionStore(indexedDbStore(), conversationId),               // optional
  onEvent: e => panel.update(e),
})
await runtime.load()
```

### 4. The main agent's tools — `orchestrationTools`

Add them to the main agent's tools and route their calls to `execOrchestrationTool`:

| Tool | |
|---|---|
| `task` | Start an agent of a type (`subagent_type`), foreground or `run_in_background`. |
| `send_message` | Message an agent by id (steer / answer / resume). |
| `stop_agent` | Stop one agent. |
| `list_agents` | All agents, status, answers. |
| `await_agent` | Waits for one agent to finish and returns its answer (`timeout_seconds`, default 120). The answer is not delivered again as a notification. |
| `manage_todos` (`todoTool`) | The plan the user sees (`TodoList`). |
| `build_and_review` (`superviseTool`) | Build → review → fix until it passes. |

### 5. Agent types — profiles

Built in: **planner** (read-only), **explorer** (read-only, fast model), **builder** (makes changes, checks its own
work), **reviewer** (read-only, answers PASS/FAIL with fixes). Add your own (`AgentProfile`: `instructions`, `tools`,
`readOnly`, `model: 'inherit' | 'fast' | id`, `maxRounds`, `background`); `mergeProfiles` lets yours replace a
built-in by id. A read-only type only ever gets read-only tools.

### 6. Checking its own work — `runSupervised`

The plan → build → review → fix loop in code, not only in a prompt: a builder makes the change, a reviewer checks the
result against the acceptance criteria, failures go back to the **same builder** (it keeps its context) and are
reviewed again, up to `maxReviews` (3). Also available to the main agent as the `build_and_review` tool.
`ORCHESTRATOR_GUIDANCE` is the matching text for the main agent's system prompt.

### 7. Sessions that survive — runs and stores

- `runPersistent({ id, runs, ...loopOptions })` checkpoints the main agent's run after every round (and its plan).
- `interruptedRuns(runs)` lists runs a reload, crash or sleeping device cut off; `resumeRun(id, runs, options)`
  continues one — calls that were cut off mid-flight are answered as interrupted so the model checks and redoes them.
- Stores: `memoryStore()`, `indexedDbStore()` (browsers, the iPad shell), `fileStore(dir)` (Node, Dune). Agent
  sessions (`sessionStore`) and runs (`runStore`) are scoped by a key you choose — a conversation, a document.

The same checkpoints are what a server-side run needs: any process holding the store can continue a run.

---

## Wiring it into an app

```ts
import {
  AgentRuntime, BUILTIN_PROFILES, ORCHESTRATOR_GUIDANCE, TodoList, TODO_TOOL, createHyperyModel, execOrchestrationTool,
  execSuperviseTool, indexedDbStore, isOrchestrationTool, mergeProfiles, orchestrationTools, runPersistent, runStore,
  sessionStore, SUPERVISE_TOOL, superviseTool, todoTool,
} from '@hyperyai/sdk/agents'

const kv = indexedDbStore('my-app-agents')
const profiles = mergeProfiles(BUILTIN_PROFILES, myProfiles)
const callModel = createHyperyModel({ token, model, team })
const runtime = new AgentRuntime({ callModel, profiles: () => profiles, childTools, execChildTool, childSystemPrompt, store: sessionStore(kv, threadId) })
await runtime.load()
const todos = new TodoList([], showPlan)

await runPersistent({
  id: turnId,
  runs: runStore(kv, threadId),
  todos,
  messages: [{ role: 'system', content: `${mySystemPrompt}\n\n${ORCHESTRATOR_GUIDANCE}` }, ...history, { role: 'user', content: request }],
  tools: [...myTools(), todoTool, superviseTool, ...orchestrationTools(runtime, profiles)],
  callModel,
  execTool: call =>
    call.name === TODO_TOOL ? todos.run(call)
    : call.name === SUPERVISE_TOOL ? execSuperviseTool(runtime, call, { signal })
    : isOrchestrationTool(call.name) ? execOrchestrationTool(runtime, call, { signal })
    : runMyTool(call, signal),
  drainNotifications: () => runtime.drainParentNotifications(),
  requireAction: true,
  signal,
})
```

On start-up, offer `interruptedRuns(runs)` for resuming; on Stop, `controller.abort()` and `runtime.stopAll()`.

### PopCraft

`childTools` / `execChildTool` are the editor commands the agent may call (`lib/agent/tools`); `childSystemPrompt`
adds the document context; `store` is `indexedDbStore` scoped by document. Its own profiles (illustrator, stylist,
layout, copywriter, inspector) merge over the built-ins.

### Dune

Import the package from `.tish` like any npm module. Dune's `agentChildTasks` / `agentJobsHost` map onto
`AgentRuntime` (spawn, `resume` → `message`, `await_job` → `await_agent`), its profiles onto `AgentProfile`, and
sessions persist with `fileStore` under `.dune/agents` — which gives Dune messaging and stopping single agents, and
agents that survive a reload.

### Hypery

Server-side runs use the same loop with `memoryStore` per request or a database-backed `KeyValueStore`, so a run
started on one request can be continued by another.

---

## Reference

Types: `ChatMessage`, `ChatToolSpec`, `ModelTurn`, `CallModel`, `ToolCall`, `ToolRun`, `LoopTool`, `AgentProfile`,
`AgentSession`, `AgentEvent`, `SessionStore`, `KeyValueStore`, `AgentRunRecord`, `RunStore`, `LoopCheckpoint`, `Todo`.

Functions: `runAgentLoop`, `repairTranscript`, `batchCalls`, `createHyperyModel`, `createStreamAccumulator`,
`pruneOldImages`, `fitImagesToBudget`, `compactTranscript`, `modelSummarizer`, `orchestrationTools`,
`execOrchestrationTool`, `isOrchestrationTool`, `runSupervised`, `execSuperviseTool`, `verdictOf`, `mergeProfiles`,
`runPersistent`, `resumeRun`, `interruptedRuns`, `memoryStore`, `indexedDbStore`, `fileStore`, `sessionStore`,
`runStore`, `useAgents`, `useAgent`.

Classes: `AgentRuntime`, `TodoList`, `AgentModelError`.
