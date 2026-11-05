import { afterEach, describe, expect, it } from 'bun:test';
import {
  AppleSignInCancelled,
  AppleSignInUnavailable,
  AppleTwoFactorRequired,
  signInWithAppleNative,
} from '../native-apple.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Call = { url: string; body: Record<string, unknown> };

/** Fake Hypery: apple-native answers `first`, 2fa accepts "123456", token answers tokens. */
function fakeHypery(first: (state: string) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ url, body });
    const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status });
    if (url.endsWith('/api/oauth/apple-native')) {
      const r = first(body.state);
      return json(r.status, r.body);
    }
    if (url.endsWith('/api/oauth/apple-native/2fa')) {
      const state = calls.find((c) => c.url.endsWith('/apple-native'))!.body.state;
      return body.code === '123456'
        ? json(200, { code: 'code-2fa', state })
        : json(400, { error: 'invalid_code', error_description: 'Invalid verification code.' });
    }
    if (url.endsWith('/api/oauth/token')) {
      return json(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600, token_type: 'Bearer' });
    }
    return json(404, {});
  }) as typeof fetch;
  return calls;
}

const options = (credential: Record<string, unknown>, seen?: { nonce?: string }) => ({
  clientId: 'client',
  gatewayUrl: 'https://hypery.test',
  scopes: ['read'],
  redirectUri: 'app://auth/callback',
  storage: 'memory' as const,
  requestCredential: async (nonce: string) => {
    if (seen) seen.nonce = nonce;
    return credential;
  },
});

describe('signInWithAppleNative', () => {
  it('sends the token with the raw nonce (Apple gets its SHA-256) and returns tokens', async () => {
    const calls = fakeHypery((state) => ({ status: 200, body: { code: 'code-1', state } }));
    const seen: { nonce?: string } = {};
    const tokens = await signInWithAppleNative(options({ identityToken: 'jwt', givenName: 'Ada' }, seen));
    expect(tokens.accessToken).toBe('at');
    const sent = calls[0].body;
    expect(sent.identity_token).toBe('jwt');
    expect(sent.given_name).toBe('Ada');
    expect(sent.code_challenge_method).toBe('S256');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(sent.nonce))));
    expect(seen.nonce).toBe(Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join(''));
    expect(calls[1].body.code).toBe('code-1');
    expect(typeof calls[1].body.code_verifier).toBe('string');
  });

  it('rejects an answer for another state', async () => {
    fakeHypery(() => ({ status: 200, body: { code: 'c', state: 'other' } }));
    await expect(signInWithAppleNative(options({ identityToken: 'jwt' }))).rejects.toThrow('Sign in with Apple failed');
  });

  it('reports a cancelled sheet and a missing capability', async () => {
    fakeHypery(() => ({ status: 500, body: {} }));
    await expect(signInWithAppleNative(options({ cancelled: true }))).rejects.toBeInstanceOf(AppleSignInCancelled);
    await expect(signInWithAppleNative(options({ unavailable: true }))).rejects.toBeInstanceOf(AppleSignInUnavailable);
  });

  it("shows Hypery's message", async () => {
    fakeHypery(() => ({ status: 409, body: { error: 'account_exists', error_description: 'Use other methods' } }));
    await expect(signInWithAppleNative(options({ identityToken: 'jwt' }))).rejects.toThrow('Use other methods');
  });

  it('finishes a two-factor account with its code', async () => {
    fakeHypery(() => ({ status: 202, body: { two_factor_required: true, ticket: 't'.repeat(43) } }));
    const err = await signInWithAppleNative(options({ identityToken: 'jwt' })).catch((e) => e);
    expect(err).toBeInstanceOf(AppleTwoFactorRequired);
    await expect(err.complete('000000')).rejects.toThrow('Invalid verification code.');
    const tokens = await err.complete('123456');
    expect(tokens.accessToken).toBe('at');
  });
});
