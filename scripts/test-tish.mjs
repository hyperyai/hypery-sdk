// Run the agent core's smoke program (tish/agents/smoke.tish) on Tish's VM and as the JavaScript the package
// ships, and check both print the same. Dune runs the core natively; Tish's own CI covers that backend.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tish = (...args) => execFileSync(process.env.TISH || 'tish', args, { encoding: 'utf8' })
const vm = tish('run', '--feature', 'timers,promise,encoding', 'tish/agents/smoke.tish')
const out = mkdtempSync(join(tmpdir(), 'agents-smoke-'))
tish('build', 'tish/agents/smoke.tish', '--target', 'js', '--format', 'esm', '-o', out)
writeFileSync(join(out, 'package.json'), '{"type":"module"}')
const js = execFileSync('node', [join(out, 'smoke.js')], { encoding: 'utf8' })
process.stdout.write(vm)
if (vm !== js) {
  console.error('\nThe JavaScript build printed something else:\n' + js)
  process.exit(1)
}
const expected = ['foreground: done true', 'background: started -> done notes=2 true true', 'stop: true stopped', 'stopAll: stopped', 'supervised: true reviews=1', 'stream: café ✓ done=true', 'thrown stop: stopped (stopped)', 'profile background: running true true']
for (const line of expected) {
  if (!vm.includes(line)) { console.error('missing: ' + line); process.exit(1) }
}
console.log('VM and JS agree.')
