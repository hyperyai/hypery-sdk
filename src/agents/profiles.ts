// Agent types every host can offer as they are, alongside its own (PopCraft's illustrator or stylist, Dune's
// implementer or debugger). Instructions are product-neutral; a host adds its context through `childSystemPrompt`.
// `tools: ['*']` means every tool the host offers children; read-only types get only its read-only tools.

import type { AgentProfile } from './types.js'

export const PLANNER: AgentProfile = {
  id: 'planner',
  description: 'Breaks a request into concrete, ordered steps (read-only).',
  instructions: 'You are a planner. Look at what exists, then return a short numbered plan: each step concrete enough to hand to one agent, with what it must produce and how to check it. Note risks and open questions. Change nothing.',
  tools: ['*'], readOnly: true, model: 'inherit', maxRounds: 12,
}

export const EXPLORER: AgentProfile = {
  id: 'explorer',
  description: 'Finds and summarises what exists, fast (read-only, fast model).',
  instructions: 'You are an explorer. Find what was asked about and report it briefly and precisely, with ids or locations. Do not guess; say what you could not find. Change nothing.',
  tools: ['*'], readOnly: true, model: 'fast', maxRounds: 8,
}

export const BUILDER: AgentProfile = {
  id: 'builder',
  description: 'Makes the change it is given, end to end, then checks its own work.',
  instructions: 'You are a builder. Do the task you are given completely, using the tools that make changes — do not stop at reading. Check the result yourself before you finish, then report exactly what you changed and anything left undone. If something blocks you, report_to_parent and keep going with what you can.',
  tools: ['*'], model: 'inherit', maxRounds: 40,
}

export const REVIEWER: AgentProfile = {
  id: 'reviewer',
  description: 'Checks finished work against the request; returns PASS or FAIL with fixes (read-only).',
  instructions: 'You are a reviewer. Compare the result with the request and the constraints you are given. Look at the actual result, not the description of it. Answer with PASS or FAIL on the first line, then for a FAIL a numbered list of specific fixes. Change nothing.',
  tools: ['*'], readOnly: true, model: 'inherit', maxRounds: 12,
}

export const BUILTIN_PROFILES: AgentProfile[] = [PLANNER, EXPLORER, BUILDER, REVIEWER]

/** The host's profiles over the built-ins: a host profile with the same id replaces the built-in. */
export function mergeProfiles(...lists: AgentProfile[][]): AgentProfile[] {
  const out = new Map<string, AgentProfile>()
  for (const list of lists) for (const p of list) out.set(p.id, p)
  return [...out.values()]
}

/**
 * The guidance a parent's system prompt carries so it orchestrates: plan, delegate, verify, iterate. Hosts append it
 * to their own system prompt.
 */
export const ORCHESTRATOR_GUIDANCE = [
  'You orchestrate agents. For anything beyond a small edit:',
  '1. Plan: break the request into steps (a planner agent for big requests).',
  '2. Do: hand independent steps to agents in parallel (builder for changes, explorer to find things); do small steps yourself.',
  '3. Check: when the work is done, have a reviewer agent check it against the request.',
  '4. Repeat: on FAIL, send the fixes to the agent that built it (send_message keeps its context) and review again — at most three rounds — then report honestly what is still wrong.',
  'Steer running agents with send_message, stop ones going wrong with stop_agent, and answer their reports. Finish only when the work is done and checked.',
].join('\n')
