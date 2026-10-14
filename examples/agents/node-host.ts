// A Node (or Dune) host: sessions on disk, so agents and their transcripts are still there after a restart, and a
// finished agent can be messaged again the next day.
//   bun examples/agents/node-host.ts

import { createAgentRuntime, BUILTIN_PROFILES, sessionStore } from '../../src/agents'
import { fileStore } from '../../src/agents/node'
import { docTools, log, model, runDocTool } from './setup'

const store = sessionStore(fileStore('.agents-example'), 'node-host')
const make = () => createAgentRuntime({
  callModel: model,
  profiles: () => BUILTIN_PROFILES,
  childTools: ctx => (ctx.readOnly ? docTools.filter(t => t.readOnly) : docTools),
  execChildTool: call => runDocTool(call),
  childSystemPrompt: ctx => ctx.profile.instructions,
  store,
})

const first = make()
await first.load()
const r = await first.spawn({ profileId: 'explorer', prompt: 'Report what the document contains.' })
log('First process:', r.kind === 'done' ? r.summary : r)
await first.flush() // saved before the process ends

// A new process (a restart): the agent is still there, and continues with its context.
const second = make()
await second.load()
const id = r.kind === 'done' ? r.id : ''
log('After restart:', second.list().map(s => `${s.id} ${s.profile} ${s.status}`))
const again = await second.message(id, 'Now just give me the title.', { wait: true })
log('Continued:', again.kind === 'done' ? again.summary : again)
