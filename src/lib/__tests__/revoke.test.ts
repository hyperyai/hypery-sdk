import { afterEach, describe, expect, test } from 'bun:test';
import { revokeTokens } from '../oauth';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function capture(status = 200) {
  const calls: { url: string; body: any }[] = [];
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response('{}', { status });
  }) as any;
  return calls;
}

const config = { clientId: 'cid_123', gatewayUrl: 'https://hypery.ai' };

describe('revokeTokens (logout)', () => {
  test('sends client_id and the refresh token so the whole family is revoked', async () => {
    const calls = capture();
    expect(await revokeTokens({ accessToken: 'at', refreshToken: 'rt' }, config)).toBe(true);
    expect(calls).toEqual([
      {
        url: 'https://hypery.ai/api/oauth/revoke',
        body: { token: 'rt', token_type_hint: 'refresh_token', client_id: 'cid_123' },
      },
    ]);
  });

  test('falls back to the access token, still with client_id', async () => {
    const calls = capture();
    await revokeTokens({ accessToken: 'at' }, config);
    expect(calls[0].body).toEqual({ token: 'at', token_type_hint: 'access_token', client_id: 'cid_123' });
  });

  test('never throws and reports failure', async () => {
    capture(401);
    expect(await revokeTokens({ accessToken: 'at' }, config)).toBe(false);
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as any;
    expect(await revokeTokens({ accessToken: 'at' }, config)).toBe(false);
    expect(await revokeTokens({}, config)).toBe(false);
  });
});
