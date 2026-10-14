// The supervisor loop in code: a builder makes the change, a reviewer checks it against the criteria, failures go
// back to the same builder (it keeps its context) until the review passes.
//   bun examples/agents/supervised.ts

import { createAgentRuntime, BUILTIN_PROFILES, runSupervised } from '../../src/agents'
import { doc, docTools, log, model, runDocTool } from './setup'

const runtime = createAgentRuntime({
  callModel: model,
  profiles: () => BUILTIN_PROFILES,
  childTools: ctx => (ctx.readOnly ? docTools.filter(t => t.readOnly) : docTools),
  execChildTool: call => runDocTool(call),
  childSystemPrompt: ctx => `${ctx.profile.instructions}\n\nYou work on a small document through your tools.`,
})

const result = await runSupervised(runtime, {
  request: 'Give the document a one-line body.',
  criteria: 'The body is one line and mentions "pop".',
  onEvent: e => log(`${e.phase} ${e.round}${e.verdict ? ` → ${e.verdict.toUpperCase()}` : ''}${e.text ? `: ${e.text.split('\n')[0]}` : ''}`),
})

log(`\n${result.passed ? 'PASSED' : 'FAILED'} after ${result.reviews} review(s). Builder: ${result.report}`)
log('Document:', Object.fromEntries(doc))
