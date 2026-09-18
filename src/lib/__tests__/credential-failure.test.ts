// A session may only be discarded when the gateway actually rejected the credentials.
//
// Before this, `refreshAccessToken` and `getUserInfo` threw a bare Error, so the context had no way to tell
// "this refresh token is revoked" from "the wifi dropped" or "the gateway returned a 502" — and it cleared
// storage for all three. The result was users being signed out at random and having to log in again.

import { describe, expect, it } from 'bun:test';
import { AuthError, getUserInfo, isCredentialFailure, refreshAccessToken } from '../oauth';

const gatewayUrl = 'https://hypery.test';
const cfg = { clientId: 'c1', gatewayUrl };

/** Stub global fetch for one call. */
function withFetch<T>(impl: () => Promise<Response> | never, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (() => impl()) as unknown as typeof fetch;
  return run().finally(() => { globalThis.fetch = original; });
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('isCredentialFailure', () => {
  it('is true only when the server rejected the credentials', () => {
    expect(isCredentialFailure(new AuthError('x', 401))).toBe(true);
    expect(isCredentialFailure(new AuthError('x', 400, 'invalid_grant'))).toBe(true);
    expect(isCredentialFailure(new AuthError('x', 403))).toBe(true);
  });

  it('is false for the gateway failing, which says nothing about the token', () => {
    expect(isCredentialFailure(new AuthError('x', 500))).toBe(false);
    expect(isCredentialFailure(new AuthError('x', 502))).toBe(false);
    expect(isCredentialFailure(new AuthError('x', 503))).toBe(false);
    expect(isCredentialFailure(new AuthError('x', 429))).toBe(false);
  });

  it('is false for anything that never reached the server', () => {
    // What `fetch` rejects with when the device is offline.
    expect(isCredentialFailure(new TypeError('Failed to fetch'))).toBe(false);
    expect(isCredentialFailure(new Error('boom'))).toBe(false);
    expect(isCredentialFailure(undefined)).toBe(false);
  });
});

describe('refreshAccessToken', () => {
  it('reports a revoked refresh token as a credential failure', async () => {
    const err = await withFetch(
      () => Promise.resolve(json({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, 400)),
      () => refreshAccessToken('rt', cfg).then(() => null, e => e),
    );
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('invalid_grant');
    expect(isCredentialFailure(err)).toBe(true);
  });

  it('does NOT report a 5xx as a credential failure', async () => {
    const err = await withFetch(
      () => Promise.resolve(json({ error: 'server_error' }, 503)),
      () => refreshAccessToken('rt', cfg).then(() => null, e => e),
    );
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(503);
    expect(isCredentialFailure(err)).toBe(false);
  });

  it('survives a non-JSON error body instead of masking the status', async () => {
    // A 502 from a proxy is an HTML page; `await response.json()` used to throw here, so the real status
    // was lost and the caller saw an opaque error it then treated as a dead session.
    const err = await withFetch(
      () => Promise.resolve(new Response('<html>502 Bad Gateway</html>', { status: 502 })),
      () => refreshAccessToken('rt', cfg).then(() => null, e => e),
    );
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(502);
    expect(isCredentialFailure(err)).toBe(false);
  });

  it('propagates an offline fetch rejection untouched', async () => {
    const err = await withFetch(
      () => { throw new TypeError('Failed to fetch'); },
      () => refreshAccessToken('rt', cfg).then(() => null, e => e),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect(isCredentialFailure(err)).toBe(false);
  });
});

describe('getUserInfo', () => {
  it('reports 401 as a credential failure', async () => {
    const err = await withFetch(
      () => Promise.resolve(json({}, 401)),
      () => getUserInfo('at', gatewayUrl).then(() => null, e => e),
    );
    expect(isCredentialFailure(err)).toBe(true);
  });

  it('does not report a 500 as a credential failure', async () => {
    const err = await withFetch(
      () => Promise.resolve(json({}, 500)),
      () => getUserInfo('at', gatewayUrl).then(() => null, e => e),
    );
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(500);
    expect(isCredentialFailure(err)).toBe(false);
  });
});
