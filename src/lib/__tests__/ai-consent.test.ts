import { describe, expect, it } from 'bun:test';
import {
  AiConsentController,
  AiConsentDeclined,
  aiConsentKey,
  ensureAllowed,
  isAiRequest,
  localAiConsentStorage,
  type AiConsentAnswer,
  type AiConsentStorage,
} from '../ai-consent.js';

// App Review 5.1.1(i) / 5.1.2(i): nothing goes to an AI provider until the person allowed it, they're asked once,
// and an AI action waits for their answer instead of failing.

function memoryStorage(initial: Record<string, boolean> = {}) {
  const m = new Map<string, boolean>(Object.entries(initial));
  const writes: [string, boolean][] = [];
  const storage: AiConsentStorage = {
    get: (k) => (m.has(k) ? (m.get(k) as boolean) : null) as AiConsentAnswer,
    set: (k, v) => {
      m.set(k, v);
      writes.push([k, v]);
    },
  };
  return { storage, writes };
}

const KEY = aiConsentKey('app_1', 'user_1');

describe('aiConsentKey', () => {
  it('is per app and per person', () => {
    expect(aiConsentKey('app_1', 'user_1')).toBe('hypery_ai_consent:app_1:user_1');
    expect(aiConsentKey('app_1', 'user_2')).not.toBe(aiConsentKey('app_1', 'user_1'));
    expect(aiConsentKey('app_2', 'user_1')).not.toBe(aiConsentKey('app_1', 'user_1'));
    expect(aiConsentKey('app_1')).toBe('hypery_ai_consent:app_1');
  });
});

describe('isAiRequest', () => {
  it('matches the Hypery endpoints that send content to a model', () => {
    for (const path of [
      '/api/v1/chat/completions',
      '/api/v1/completions',
      '/api/v1/embeddings',
      '/api/v1/images/generations',
      '/api/v1/audio/transcriptions',
      '/api/v1/realtime/sessions',
      '/api/v1/predictions',
      '/api/v1/ai/language-model',
    ]) {
      expect(isAiRequest(`https://hypery.ai${path}`)).toBe(true);
      expect(isAiRequest(new URL(path, 'https://hypery.ai'))).toBe(true);
    }
  });
  it('leaves everything else alone', () => {
    for (const url of ['https://hypery.ai/api/v1/models', 'https://hypery.ai/api/user/me', 'https://hypery.ai/api/oauth/token', '/api/v1/usage/charge']) {
      expect(isAiRequest(url)).toBe(false);
    }
  });
});

describe('AiConsentController', () => {
  it('asks once on start when not asked yet, and keeps the answer', async () => {
    const { storage, writes } = memoryStorage();
    const c = new AiConsentController(storage, KEY, true);
    await c.load();
    expect(c.getState()).toEqual({ answer: null, open: true });
    await c.respond(true);
    expect(c.getState()).toEqual({ answer: true, open: false });
    expect(writes).toEqual([[KEY, true]]);

    // Next launch: answered, so not asked again.
    const again = new AiConsentController(storage, KEY, true);
    await again.load();
    expect(again.getState()).toEqual({ answer: true, open: false });
  });

  it('closing the dialog is "Don\'t allow", and the person is not asked again on start', async () => {
    const { storage } = memoryStorage();
    const c = new AiConsentController(storage, KEY, true);
    await c.load();
    await c.respond(false);
    const again = new AiConsentController(storage, KEY, true);
    await again.load();
    expect(again.getState()).toEqual({ answer: false, open: false });
  });

  it('ensure() resolves at once when allowed, without opening the dialog', async () => {
    const { storage } = memoryStorage({ [KEY]: true });
    const c = new AiConsentController(storage, KEY, true);
    await c.load();
    expect(await c.ensure()).toBe(true);
    expect(c.getState().open).toBe(false);
  });

  it('ensure() waits for the answer instead of failing: every waiting call gets it', async () => {
    const { storage } = memoryStorage();
    const c = new AiConsentController(storage, KEY, false);
    await c.load();
    expect(c.getState().open).toBe(false); // askOnStart off: not asked yet
    const first = c.ensure();
    const second = c.ensure();
    expect(c.getState().open).toBe(true);
    await c.respond(true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });

  it('after a no, an AI action asks again (the person tried AI) and resolves false if they still say no', async () => {
    const { storage } = memoryStorage({ [KEY]: false });
    const c = new AiConsentController(storage, KEY, true);
    await c.load();
    expect(c.getState().open).toBe(false);
    const attempt = c.ensure();
    expect(c.getState().open).toBe(true);
    await c.respond(false);
    expect(await attempt).toBe(false);
  });

  it('notifies subscribers on every change (React re-renders from it)', async () => {
    const { storage } = memoryStorage();
    const c = new AiConsentController(storage, KEY, true);
    let calls = 0;
    const unsubscribe = c.subscribe(() => calls++);
    await c.load();
    await c.set(true);
    unsubscribe();
    await c.set(false);
    expect(calls).toBe(2);
  });
});

describe('ensureAllowed', () => {
  it('sends only on a yes: a no throws AiConsentDeclined', async () => {
    await ensureAllowed(true, () => Promise.reject(new Error('not asked when allowed')));
    await ensureAllowed(null, async () => true);
    await expect(ensureAllowed(null, async () => false)).rejects.toBeInstanceOf(AiConsentDeclined);
    await expect(ensureAllowed(false, async () => false)).rejects.toThrow(/AI is turned off/);
  });
});

describe('localAiConsentStorage', () => {
  it('round-trips through localStorage, and answers null without one', () => {
    const original = globalThis.localStorage;
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    try {
      expect(localAiConsentStorage.get(KEY)).toBeNull();
      localAiConsentStorage.set(KEY, false);
      expect(localAiConsentStorage.get(KEY)).toBe(false);
      localAiConsentStorage.set(KEY, true);
      expect(localAiConsentStorage.get(KEY)).toBe(true);
      (globalThis as { localStorage?: unknown }).localStorage = undefined;
      expect(localAiConsentStorage.get(KEY)).toBeNull();
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });
});
