// The agent core's key-value store on IndexedDB (browsers, the iPad shell). A host adapter: the core itself is Tish
// (tish/agents) and has no browser APIs; this is how a browser host hands it storage.

import type { KeyValueStore } from './core/store.js'

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
    // A missing key reads as null, as the core's stores do.
    get: async (k: string) => (await tx('readonly', s => s.get(k))) ?? null,
    set: async (k: string, v: unknown) => { await tx('readwrite', s => s.put(structuredClone(v), k)) },
    delete: async (k: string) => { await tx('readwrite', s => s.delete(k)) },
    keys: async (prefix: string) => ((await tx('readonly', s => s.getAllKeys())) as IDBValidKey[]).map(String).filter(k => k.startsWith(prefix)),
  }
}
