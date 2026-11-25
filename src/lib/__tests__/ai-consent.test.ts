import { describe, expect, it } from 'bun:test';
import {
  AiConsentController,
  AiConsentDeclined,
  appRouteAiConsentStorage,
  ensureAllowed,
  fetchAiConsent,
  hyperyAiConsentStorage,
  isAiRequest,
  saveAiConsent,
  type AiConsentAnswer,
  type AiConsentStorage,
} from '../ai-consent.js';

// App Review 5.1.1(i) / 5.1.2(i): nothing goes to an AI provider until the person allowed it, they're asked once,
// an AI action waits for their answer instead of failing, and the answer is kept with their Hypery account.

/** The account's answer, as Hypery keeps it. */
function memoryStorage(initial: AiConsentAnswer = null) {
  let answer = initial;
  const writes: boolean[] = [];
  const storage: AiConsentStorage = {
    get: async () => answer,
    set: async (allowed) => {
      answer = allowed;
      writes.push(allowed);
    },
  };
  return { storage, writes };
}

/** A stand-in for Hypery's /api/user/ai-consent (and an app route in front of it). */
function fakeHypery(initial: AiConsentAnswer = null) {
  let allowed = initial;
  const seen: { url: string; method: string; auth?: string; body?: unknown }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = (init.headers ?? {}) as Record<string, string>;
    seen.push({ url, method: init.method ?? 'GET', auth: headers.Authorization, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (init.method === 'PUT') allowed = JSON.parse(String(init.body)).allowed;
    return new Response(JSON.stringify({ allowed, updatedAt: null }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, seen, answer: () => allowed };
}

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
  it('asks once on start when not asked yet, and keeps the answer (next launch or another device: not asked)', async () => {
    const { storage, writes } = memoryStorage();
    const c = new AiConsentController(storage, true);
    await c.load();
    expect(c.getState()).toEqual({ answer: null, open: true });
    await c.respond(true);
    expect(c.getState()).toEqual({ answer: true, open: false });
    expect(writes).toEqual([true]);

    // Next launch: answered, so not asked again.
    const again = new AiConsentController(storage, true);
    await again.load();
    expect(again.getState()).toEqual({ answer: true, open: false });
  });

  it('closing the dialog is "Don\'t allow", and the person is not asked again on start', async () => {
    const { storage } = memoryStorage();
    const c = new AiConsentController(storage, true);
    await c.load();
    await c.respond(false);
    const again = new AiConsentController(storage, true);
    await again.load();
    expect(again.getState()).toEqual({ answer: false, open: false });
  });

  it('ensure() resolves at once when allowed, without opening the dialog', async () => {
    const { storage } = memoryStorage(true);
    const c = new AiConsentController(storage, true);
    await c.load();
    expect(await c.ensure()).toBe(true);
    expect(c.getState().open).toBe(false);
  });

  it('ensure() waits for the answer instead of failing: every waiting call gets it', async () => {
    const { storage } = memoryStorage();
    const c = new AiConsentController(storage, false);
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
    const { storage } = memoryStorage(false);
    const c = new AiConsentController(storage, true);
    await c.load();
    expect(c.getState().open).toBe(false);
    const attempt = c.ensure();
    expect(c.getState().open).toBe(true);
    await c.respond(false);
    expect(await attempt).toBe(false);
  });

  it('notifies subscribers on every change (React re-renders from it)', async () => {
    const { storage } = memoryStorage();
    const c = new AiConsentController(storage, true);
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

describe('kept with the Hypery account', () => {
  it('fetchAiConsent / saveAiConsent call /api/user/ai-consent with the app token', async () => {
    const hypery = fakeHypery();
    const req = { gatewayUrl: 'https://hypery.test/', accessToken: 'tok', fetch: hypery.fetchImpl };
    expect(await fetchAiConsent(req)).toBeNull();
    await saveAiConsent({ ...req, allowed: true });
    expect(await fetchAiConsent(req)).toBe(true);
    expect(hypery.seen.map((r) => [r.method, r.url, r.auth])).toEqual([
      ['GET', 'https://hypery.test/api/user/ai-consent', 'Bearer tok'],
      ['PUT', 'https://hypery.test/api/user/ai-consent', 'Bearer tok'],
      ['GET', 'https://hypery.test/api/user/ai-consent', 'Bearer tok'],
    ]);
    expect(hypery.seen[1].body).toEqual({ allowed: true });
  });

  it('throws Hypery\'s message when it refuses', async () => {
    const refusing = (async () =>
      new Response(JSON.stringify({ error: { code: 'APP_REQUIRED', message: "Call this with the app's OAuth token" } }), { status: 403 })) as unknown as typeof fetch;
    await expect(fetchAiConsent({ gatewayUrl: 'https://hypery.test', accessToken: 't', fetch: refusing })).rejects.toThrow(/OAuth token/);
  });

  it('hyperyAiConsentStorage asks with a fresh token each time, and refuses without one', async () => {
    const hypery = fakeHypery(false);
    let n = 0;
    const storage = hyperyAiConsentStorage({ gatewayUrl: 'https://hypery.test', getAccessToken: async () => `tok${++n}`, fetch: hypery.fetchImpl });
    expect(await storage.get()).toBe(false);
    await storage.set(true);
    expect(hypery.answer()).toBe(true);
    expect(hypery.seen.map((r) => r.auth)).toEqual(['Bearer tok1', 'Bearer tok2']);
    const signedOut = hyperyAiConsentStorage({ gatewayUrl: 'https://hypery.test', getAccessToken: async () => null, fetch: hypery.fetchImpl });
    await expect(signedOut.get()).rejects.toThrow(/Sign in/);
  });

  it('appRouteAiConsentStorage goes through the app\'s own route (its server holds the token)', async () => {
    const route = fakeHypery();
    const storage = appRouteAiConsentStorage('/api/ai-consent', { fetch: route.fetchImpl });
    expect(await storage.get()).toBeNull();
    await storage.set(false);
    expect(await storage.get()).toBe(false);
    expect(route.seen.map((r) => [r.method, r.url, r.auth])).toEqual([
      ['GET', '/api/ai-consent', undefined],
      ['PUT', '/api/ai-consent', undefined],
      ['GET', '/api/ai-consent', undefined],
    ]);
  });

  it('the controller on the account: answered on one device, not asked on the next', async () => {
    const hypery = fakeHypery();
    const deviceA = new AiConsentController(hyperyAiConsentStorage({ gatewayUrl: 'https://hypery.test', getAccessToken: async () => 'a', fetch: hypery.fetchImpl }), true);
    await deviceA.load();
    expect(deviceA.getState().open).toBe(true);
    await deviceA.respond(true);
    const deviceB = new AiConsentController(hyperyAiConsentStorage({ gatewayUrl: 'https://hypery.test', getAccessToken: async () => 'b', fetch: hypery.fetchImpl }), true);
    await deviceB.load();
    expect(deviceB.getState()).toEqual({ answer: true, open: false });
  });
});
