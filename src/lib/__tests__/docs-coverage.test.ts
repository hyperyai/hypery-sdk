import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard: every name exported from the package entry point (runtime values and
 * types) must be documented as `Name` (in backticks) in docs/*.md, so a new
 * export can't ship undocumented.
 */

const root = join(import.meta.dir, '..', '..', '..');

function exportedNames(): string[] {
  const src = readFileSync(join(root, 'src', 'index.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const spec = part.trim();
      if (!spec) continue;
      // `a as b` exports `b`
      const name = spec.split(/\s+as\s+/).pop()!.replace(/^type\s+/, '').trim();
      names.add(name);
    }
  }
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:const|function|class|type|interface)\s+(\w+)/g)) {
    names.add(m[1]);
  }
  return [...names].sort();
}

function docsText(): string {
  const dir = join(root, 'docs');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}

describe('public API documentation', () => {
  it('finds the exports', () => {
    const names = exportedNames();
    expect(names).toContain('HyperyProvider');
    expect(names).toContain('UseAppSubscriptionReturn');
    expect(names.length).toBeGreaterThan(80);
  });

  it('documents every export from src/index.ts in docs/*.md', () => {
    const docs = docsText();
    const missing = exportedNames().filter((name) => !docs.includes(`\`${name}\``));
    expect(missing).toEqual([]);
  });
});
