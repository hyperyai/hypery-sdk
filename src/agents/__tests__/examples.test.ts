import { describe, expect, it } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

// The examples run offline (a scripted model) — they are part of the docs, so they must keep working.
const root = join(import.meta.dir, '../../..')
const run = (file: string) => {
  const p = Bun.spawnSync(['bun', join(root, 'examples/agents', file)], { cwd: root, env: { ...process.env, HYPERY_TOKEN: '' } })
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() }
}

describe('examples (offline)', () => {
  it('basic acts on the request', () => {
    const r = run('basic.ts')
    expect(r.code).toBe(0)
    expect(r.out).toContain('Pop Weekly')
  })
  it('orchestrator runs agents in parallel and hears back from the background one', () => {
    const r = run('orchestrator.ts')
    expect(r.code).toBe(0)
    expect(r.out).toContain('explorer done')
    expect(r.out).toContain('builder done')
  })
  it('supervised passes review', () => {
    const r = run('supervised.ts')
    expect(r.out).toContain('PASSED')
  })
  it('persistent resumes after a crash', () => {
    rmSync(join(root, '.agents-example'), { recursive: true, force: true })
    expect(run('persistent.ts').out).toContain('simulated crash')
    const second = run('persistent.ts')
    expect(second.out).toContain('Resuming')
    expect(second.out).toContain('Pop Weekly')
  })
  it('node host keeps agents across a restart', () => {
    rmSync(join(root, '.agents-example'), { recursive: true, force: true })
    const r = run('node-host.ts')
    expect(r.out).toContain('After restart: [ "agent-')
    expect(r.out).not.toContain('unknown')
    rmSync(join(root, '.agents-example'), { recursive: true, force: true })
  })
})
