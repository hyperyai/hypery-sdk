// The loop on its own: one agent, two tools, keeps going until it has done what was asked (`requireAction`).
//   bun examples/agents/basic.ts

import { runAgentLoop } from '../../src/agents'
import { doc, docTools, log, model, runDocTool } from './setup'

const outcome = await runAgentLoop({
  messages: [
    { role: 'system', content: 'You edit a small document with the tools you have. Do what is asked, then say what you changed.' },
    { role: 'user', content: 'Set the title to "Pop Weekly".' },
  ],
  tools: docTools,
  callModel: model,
  execTool: runDocTool,
  requireAction: true,
  hooks: {
    onToolStart: c => log(`→ ${c.name} ${c.argsText}`),
    onNudge: m => log(`(nudged: ${m})`),
  },
})

log(`\n${outcome.text}`)
log('Document:', Object.fromEntries(doc), `(${outcome.rounds} rounds, acted: ${outcome.acted})`)
