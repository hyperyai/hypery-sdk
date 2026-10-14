// Node (and Dune) storage for agent state: one JSON file per key in a directory. Separate entry point
// (`@hyperyai/sdk/agents/node`) so browser bundles never import `fs`.

import { mkdir, readdir, readFile, rm, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { KeyValueStore } from '../core/store.js'

const encode = (key: string) => encodeURIComponent(key) + '.json'
const decode = (file: string) => decodeURIComponent(file.replace(/\.json$/, ''))

export function fileStore(dir: string): KeyValueStore {
  const ready = mkdir(dir, { recursive: true })
  return {
    async get<T>(key: string) {
      await ready
      try { return JSON.parse(await readFile(join(dir, encode(key)), 'utf8')) as T } catch { return undefined }
    },
    async set(key, value) {
      await ready
      // Write then rename: a crash mid-write never leaves a half-written run.
      const file = join(dir, encode(key))
      await writeFile(`${file}.tmp`, JSON.stringify(value))
      await rename(`${file}.tmp`, file)
    },
    async delete(key) {
      await ready
      await rm(join(dir, encode(key)), { force: true })
    },
    async keys(prefix) {
      await ready
      return (await readdir(dir)).filter(f => f.endsWith('.json')).map(decode).filter(k => k.startsWith(prefix))
    },
  }
}

export * from '../index.js'
