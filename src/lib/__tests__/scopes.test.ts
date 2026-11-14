import { afterEach, describe, expect, it, mock } from 'bun:test';
import { clearOAuthTransaction, exchangeCodeForToken, getAuthorizationUrl, refreshAccessToken } from '../oauth.js';
import {
  InsufficientScopeError,
  isInsufficientScopeError,
  mergeScopes,
  parseInsufficientScope,
  requestScopes,
  throwIfInsufficientScope,
  withScope,
} from '../scopes.js';
import { TokenStorage } from '../storage.js';

const base = { clientId: 'c1', redirectUri: 'https://app.test/cb', gatewayUrl: 'https://gw.test' };
const realFetch = globalThis.fetch;

afterEach(() => {
  clearOAuthTransaction('memory');
  globalThis.fetch = realFetch;
});

/** The exact body Hypery's /api/v1/* routes send. */
function hypery403(scope = 'ai:embeddings', headers?: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: { message: `OAuth token requires the ${scope} scope`, type: 'insufficient_scope', code: 'insufficient_scope' },
    }),
    { status: 403, headers: { 'Content-Type': 'application/json', ...headers } },
  );
}

function tokenFetch(scope: string) {
  return mock(async () =>
    new Response(JSON.stringify({ access_token: 'new', refresh_token: 'r2', expires_in: 3600, token_type: 'Bearer', scope })),
  );
}

describe('parseInsufficientScope', () => {
  it("reads Hypery's 403 body, scope from the message", async () => {
    const err = await parseInsufficientScope(hypery403());
    expect(err).toBeInstanceOf(InsufficientScopeError);
    expect(err!.requiredScopes).toEqual(['ai:embeddings']);
    expect(err!.status).toBe(403);
    expect(isInsufficientScopeError(err)).toBe(true);
  });

  it('prefers the WWW-Authenticate scope', async () => {
    const res = hypery403('x', { 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="ai:audio ai:images"' });
    expect((await parseInsufficientScope(res))!.requiredScopes).toEqual(['ai:audio', 'ai:images']);
  });

  it('accepts a header-only 403 and an RFC 6750 flat body', async () => {
    const h = new Response('nope', { status: 403, headers: { 'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="a"' } });
    expect((await parseInsufficientScope(h))!.requiredScopes).toEqual(['a']);
    const flat = new Response(JSON.stringify({ error: 'insufficient_scope', scope: 'b c' }), { status: 403 });
    expect((await parseInsufficientScope(flat))!.requiredScopes).toEqual(['b', 'c']);
  });

  it('ignores other statuses and other 403s, and leaves the body readable', async () => {
    expect(await parseInsufficientScope(new Response('{}', { status: 200 }))).toBeNull();
    expect(await parseInsufficientScope(new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }))).toBeNull();
    const res = hypery403();
    await parseInsufficientScope(res);
    expect((await res.json()).error.code).toBe('insufficient_scope');
  });

  it('throwIfInsufficientScope throws the typed error', async () => {
    await expect(throwIfInsufficientScope(hypery403('ai:audio'))).rejects.toBeInstanceOf(InsufficientScopeError);
    const ok = new Response('{}');
    expect(await throwIfInsufficientScope(ok)).toBe(ok);
  });
});

describe('granted scopes from the token response', () => {
  it('exchange and refresh carry `scope` as scopes', async () => {
    const url = new URL(await getAuthorizationUrl({ ...base, scopes: ['read'], storage: 'memory' }));
    globalThis.fetch = tokenFetch('read ai:chat') as any;
    const tokens = await exchangeCodeForToken('code', { ...base, storage: 'memory', state: url.searchParams.get('state') });
    expect(tokens.scopes).toEqual(['read', 'ai:chat']);
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 1, token_type: 'Bearer' }))) as any;
    expect((await refreshAccessToken('r', base)).scopes).toBeUndefined();
  });
});

describe('requestScopes', () => {
  it('asks for the union of current and new scopes and replaces the stored token (external mode)', async () => {
    const store = new TokenStorage('memory');
    store.saveTokens({ accessToken: 'old', refreshToken: 'r1', expiresIn: 3600, tokenType: 'Bearer', scopes: ['read'] });
    globalThis.fetch = tokenFetch('read ai:chat ai:audio') as any;
    let asked: URL | null = null;
    const result = await requestScopes(['ai:audio'], {
      ...base,
      storage: 'memory',
      currentScopes: ['read', 'ai:chat'],
      tokenStorage: store,
      openUrl: async (u, redirectUri) => {
        asked = new URL(u);
        expect(redirectUri).toBe(base.redirectUri);
        return `${redirectUri}?code=abc&state=${asked.searchParams.get('state')}`;
      },
    });
    expect(asked!.searchParams.get('scope')).toBe('read ai:chat ai:audio');
    expect(asked!.searchParams.get('code_challenge_method')).toBe('S256');
    expect(result).toMatchObject({ ok: true, grantedScopes: ['read', 'ai:chat', 'ai:audio'] });
    expect(store.getTokens()!.accessToken).toBe('new');
    expect(store.getTokens()!.scopes).toEqual(['read', 'ai:chat', 'ai:audio']);
  });

  it('rejects a callback with the wrong state and keeps the old token', async () => {
    const store = new TokenStorage('memory');
    store.saveTokens({ accessToken: 'old', refreshToken: 'r1', expiresIn: 3600, tokenType: 'Bearer' });
    const fetchMock = tokenFetch('read');
    globalThis.fetch = fetchMock as any;
    await expect(
      requestScopes(['ai:audio'], { ...base, storage: 'memory', tokenStorage: store, openUrl: async (_u, r) => `${r}?code=abc&state=forged` }),
    ).rejects.toThrow(/state mismatch/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getTokens()!.accessToken).toBe('old');
  });

  it('reports cancel and denial from the host', async () => {
    expect(await requestScopes(['x'], { ...base, storage: 'memory', openUrl: async () => null })).toEqual({ ok: false, reason: 'cancelled' });
    expect(await requestScopes(['x'], { ...base, storage: 'memory', openUrl: async (_u, r) => `${r}?error=access_denied` }))
      .toEqual({ ok: false, reason: 'denied', error: 'access_denied' });
  });

  it("'external' without openUrl is an error", async () => {
    await expect(requestScopes(['x'], { ...base, storage: 'memory', mode: 'external' })).rejects.toThrow(/openUrl/);
  });
});

describe('withScope', () => {
  it('requests once and retries after a thrown InsufficientScopeError', async () => {
    let calls = 0;
    const request = mock(async (_s: string[]) => ({ ok: true as const, tokens: {} as any, grantedScopes: [] }));
    const out = await withScope('ai:audio', async () => {
      if (calls++ === 0) throw new InsufficientScopeError(['ai:audio', 'ai:images']);
      return 'done';
    }, request);
    expect(out).toBe('done');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toEqual(['ai:audio', 'ai:images']);
  });

  it('retries after a 403 insufficient_scope Response', async () => {
    let calls = 0;
    const res = await withScope('ai:embeddings', async () => (calls++ === 0 ? hypery403() : new Response('ok')), async () => ({
      ok: true, tokens: {} as any, grantedScopes: [],
    }));
    expect(await res.text()).toBe('ok');
  });

  it('throws the original error when the upgrade fails, and passes other errors through', async () => {
    const missing = new InsufficientScopeError(['a']);
    await expect(withScope('a', async () => { throw missing; }, async () => ({ ok: false, reason: 'cancelled' }))).rejects.toBe(missing);
    const request = mock(async () => ({ ok: false as const, reason: 'cancelled' as const }));
    await expect(withScope('a', async () => { throw new Error('boom'); }, request)).rejects.toThrow('boom');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('mergeScopes', () => {
  it('keeps first-seen order without duplicates', () => {
    expect(mergeScopes(['read', 'write'], ['write', 'ai:audio'], undefined)).toEqual(['read', 'write', 'ai:audio']);
  });
});
