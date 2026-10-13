# Agents (`@hyperyai/sdk/agents`)

A shared agent core for every Hypery app — PopCraft's editor agent, Dune's IDE agent, Hypery's own. No framework, no
dependencies: your app supplies the model call, its tools, its prompts and (optionally) storage.

## What it gives you

- **`runAgentLoop`** — assistant turn → tool calls → results → repeat until done. Independent (read-only) calls run in
  parallel, edits in order. `requireAction` keeps a turn that was asked to change something from ending after only
  reading. Dropped or stalled model streams are retried. Notifications (inbox, reports, finished agents) land between
  rounds; one arriving as the model stops continues it.
- **`AgentRuntime`** — a parent's agents as addressable sessions: spawn (foreground or background), **message** a
  running agent (it reads it at its next step) or a finished one (resumed with its whole context), **stop** one,
  **list** them. Agents can **report** to the parent mid-run. Sessions go through your `store` to survive a reload.
- **`orchestrationTools` / `execOrchestrationTool`** — the parent's tools: `task`, `send_message`, `stop_agent`,
  `list_agents`, `await_agent`. Children get `report_to_parent`; they never get the parent's tools (depth 1).
- **Agent types** — `planner`, `explorer` (fast model), `builder`, `reviewer`, merged with your own
  (`mergeProfiles`). `ORCHESTRATOR_GUIDANCE` is the plan → delegate → review → fix loop for your system prompt.

## Using it

```ts
import {
  AgentRuntime, BUILTIN_PROFILES, mergeProfiles, orchestrationTools, execOrchestrationTool,
  isOrchestrationTool, runAgentLoop, ORCHESTRATOR_GUIDANCE,
} from '@hyperyai/sdk/agents'

const profiles = mergeProfiles(BUILTIN_PROFILES, myProfiles)
const runtime = new AgentRuntime({
  callModel,                                  // (messages, tools, hooks, signal) => { text, toolCalls }
  profiles: () => profiles,
  childTools: ctx => myTools(ctx.readOnly),   // LoopTool[] (spec + readOnly)
  execChildTool: (call, ctx) => runMyTool(call, ctx.signal),
  childSystemPrompt: ctx => `${ctx.profile.instructions}\n\n${myContext()}`,
  store: myStore,                             // optional: { load, save }
})
await runtime.load()

const outcome = await runAgentLoop({
  messages: [{ role: 'system', content: `${mySystemPrompt}\n\n${ORCHESTRATOR_GUIDANCE}` }, { role: 'user', content: request }],
  tools: [...myTools(false), ...orchestrationTools(runtime, profiles)],
  callModel,
  execTool: call => (isOrchestrationTool(call.name) ? execOrchestrationTool(runtime, call, { signal }) : runMyTool(call, signal)),
  drainNotifications: () => runtime.drainParentNotifications(),
  requireAction: true,
  signal,
})
```

Stop everything with `runtime.stopAll()` when the user presses Stop.
