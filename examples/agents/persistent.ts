// A run that survives a crash, a reload or a sleeping device: every round is saved to disk, and running this again
// continues an interrupted run from its last checkpoint.
//   bun examples/agents/persistent.ts          # interrupted halfway (simulated crash)
//   bun examples/agents/persistent.ts          # resumes it and finishes

import { interruptedRuns, resumeRun, runPersistent, runStore } from '../../src/agents'
import { fileStore } from '../../src/agents/node'
import { docTools, log, model, runDocTool } from './setup'

const runs = runStore(fileStore('.agents-example'), 'example')
const tools = docTools
let rounds = 0
const execTool = async (call: Parameters<typeof runDocTool>[0]) => {
  // First run only: crash after the first tool, as a closed tab or a killed process would.
  if (crashing && ++rounds > 1) { log('(simulated crash)'); process.exit(0) }
  log(`→ ${call.name}`)
  return runDocTool(call)
}

const left = await interruptedRuns(runs)
const crashing = left.length === 0
if (left.length) {
  log(`Resuming ${left[0].id} from round ${left[0].checkpoint.round}…`)
  const out = await resumeRun(left[0].id, runs, { tools, callModel: model, execTool, requireAction: true })
  log(`\n${out.text}`)
  await runs.remove(left[0].id)
} else {
  log('Starting a run…')
  await runPersistent({
    id: `run-${Date.now()}`, runs, tools, callModel: model, execTool, requireAction: true,
    messages: [
      { role: 'system', content: 'You edit a small document with your tools.' },
      { role: 'user', content: 'Set the title to "Pop Weekly", then write a one-line body.' },
    ],
  })
}
