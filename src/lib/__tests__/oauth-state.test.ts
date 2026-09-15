import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  clearOAuthTransaction,
  exchangeCodeForToken,
  getAuthorizationUrl,
  verifyOAuthState,
} from '../oauth';

const base = { clientId: 'c1', redirectUri: 'https://app.test/cb', gatewayUrl: 'https://gw.test' };
const realFetch = globalThis.fetch;

function shimSessionStorage() {
  const data = new Map<string, string>();
  (globalThis as any).window = {};
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  return data;
}

afterEach(() => {
  clearOAuthTransaction('memory');
  delete (globalThis as any).window;
  delete (globalThis as any).sessionStorage;
  globalThis.fetch = realFetch;
});

describe('OAuth login transaction (verifier + state)', () => {
  it("memory mode persists verifier + state in sessionStorage for the redirect round-trip", async () => {
    const data = shimSessionStorage();
    const url = new URL(await getAuthorizationUrl({ ...base, scopes: ['read'], storage: 'memory' }));
    expect(data.get('hypery_oauth_verifier')).toBeTruthy();
    expect(data.get('hypery_oauth_state')).toBe(url.searchParams.get('state')!);
  });

  it('memory mode falls back to an in-memory store without Web Storage', async () => {
    const url = new URL(await getAuthorizationUrl({ ...base, scopes: ['read'], storage: 'memory' }));
    expect(() => verifyOAuthState('memory', url.searchParams.get('state'))).not.toThrow();
  });

  it('passes the provider hint to the authorize URL', async () => {
    const url = new URL(await getAuthorizationUrl({ ...base, scopes: ['read'], storage: 'memory', provider: 'github' }));
    expect(url.searchParams.get('provider')).toBe('github');
  });

  it('rejects a mismatched or missing state without exchanging the code', async () => {
    await getAuthorizationUrl({ ...base, scopes: ['read'], storage: 'memory', state: 'expected' });
    const fetchMock = mock(async () => new Response('{}'));
    globalThis.fetch = fetchMock as any;
    await expect(exchangeCodeForToken('code', { ...base, storage: 'memory', state: 'attacker' })).rejects.toThrow(/state mismatch/);
    await expect(exchangeCodeForToken('code', { ...base, storage: 'memory', state: null })).rejects.toThrow(/state mismatch/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges with the stored verifier on a matching state and clears the transaction', async () => {
    await getAuthorizationUrl({ ...base, scopes: ['read'], storage: 'memory', state: 's1' });
    let sent: any;
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600, token_type: 'Bearer' }));
    }) as any;
    const tokens = await exchangeCodeForToken('code', { ...base, storage: 'memory', state: 's1' });
    expect(tokens.accessToken).toBe('a');
    expect(typeof sent.code_verifier).toBe('string');
    expect(() => verifyOAuthState('memory', 's1')).toThrow(/state mismatch/);
  });
});
