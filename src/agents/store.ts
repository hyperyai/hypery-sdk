// Where agent state lives between reloads. One small key-value interface, implemented once per environment — memory
// (tests, servers), IndexedDB (browsers, the iPad shell), files (Node, Dune: `@hyperyai/sdk/agents/node`) — and the
// session and run stores built on it.

import type { AgentSession, SessionStore } from './runtime.js'
import type { LoopCheckpoint } from './loop.js'

export interface KeyValueStore {
  get<T = unknown>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(prefix: string): Promise<string[]>
}

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return {
    get: async <T>(k: string) => (map.has(k) ? (JSON.parse(map.get(k)!) as T) : undefined),
    set: async (k, v) => { map.set(k, JSON.stringify(v)) },
    delete: async k => { map.delete(k) },
    keys: async prefix => [...map.keys()].filter(k => k.startsWith(prefix)),
  }
}

/** IndexedDB, no dependencies. One database per `name`, one object store. */
export function indexedDbStore(name = 'hypery-agents'): KeyValueStore {
  let db: Promise<IDBDatabase> | null = null
  const open = () => (db ??= new Promise((res, rej) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore('kv') }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  }))
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const store = (await open()).transaction('kv', mode).objectStore('kv')
    return new Promise<T>((res, rej) => { const r = fn(store); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  }
  return {
    get: async <T>(k: string) => (await tx('readonly', s => s.get(k))) as T | undefined,
    set: async (k, v) => { await tx('readwrite', s => s.put(structuredClone(v), k)) },
    delete: async k => { await tx('readwrite', s => s.delete(k)) },
    keys: async prefix => ((await tx('readonly', s => s.getAllKeys())) as IDBValidKey[]).map(String).filter(k => k.startsWith(prefix)),
  }
}

/** Agent sessions under `<scope>:session:<id>` (scope: a conversation, a document, a workspace). */
export function sessionStore(kv: KeyValueStore, scope = 'default'): SessionStore {
  const prefix = `${scope}:session:`
  return {
    load: async () => (await Promise.all((await kv.keys(prefix)).map(k => kv.get<AgentSession>(k)))).filter((s): s is AgentSession => !!s),
    save: s => kv.set(prefix + s.id, s),
    remove: id => kv.delete(prefix + id),
  }
}

export type RunStatus = 'running' | 'done' | 'stopped' | 'error'

/** A main-agent run: its checkpoint (transcript and loop state) and its plan, saved after every round. */
export interface AgentRunRecord {
  id: string
  status: RunStatus
  createdAt: number
  updatedAt: number
  checkpoint: LoopCheckpoint
  todos?: import('./todos.js').Todo[]
  /** The host's own fields (the request, the document, the model…). */
  meta?: Record<string, unknown>
  error?: string
}

export interface RunStore {
  get(id: string): Promise<AgentRunRecord | undefined>
  save(run: AgentRunRecord): Promise<void>
  list(): Promise<AgentRunRecord[]>
  remove(id: string): Promise<void>
}

export function runStore(kv: KeyValueStore, scope = 'default'): RunStore {
  const prefix = `${scope}:run:`
  return {
    get: id => kv.get<AgentRunRecord>(prefix + id),
    save: run => kv.set(prefix + run.id, run),
    list: async () => (await Promise.all((await kv.keys(prefix)).map(k => kv.get<AgentRunRecord>(k)))).filter((r): r is AgentRunRecord => !!r),
    remove: id => kv.delete(prefix + id),
  }
}
