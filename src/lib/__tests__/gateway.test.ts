import { afterEach, describe, expect, it } from 'bun:test';
import { errorMessageFromBody, resolveGatewayUrl } from '../gateway';
import { fetchMembershipsShared } from '../../hooks/useMemberships';
import type { BillingMode } from '../../hooks/useWallet';

const realFetch = globalThis.fetch;
const realEnv = process.env.NEXT_PUBLIC_GATEWAY_URL;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realEnv === undefined) delete process.env.NEXT_PUBLIC_GATEWAY_URL;
  else process.env.NEXT_PUBLIC_GATEWAY_URL = realEnv;
});

describe('resolveGatewayUrl', () => {
  it('explicit > provider > env > relative', () => {
    process.env.NEXT_PUBLIC_GATEWAY_URL = 'https://env.test';
    expect(resolveGatewayUrl('https://explicit.test', 'https://provider.test')).toBe('https://explicit.test');
    expect(resolveGatewayUrl(undefined, 'https://provider.test/')).toBe('https://provider.test');
    expect(resolveGatewayUrl(undefined, undefined)).toBe('https://env.test');
    delete process.env.NEXT_PUBLIC_GATEWAY_URL;
    expect(resolveGatewayUrl()).toBe('');
  });
});

describe('errorMessageFromBody', () => {
  it('never yields [object Object]', () => {
    expect(errorMessageFromBody({ error: { code: 'X', message: 'Card declined' } }, 'fb')).toBe('Card declined');
    expect(errorMessageFromBody({ error: 'plain' }, 'fb')).toBe('plain');
    expect(errorMessageFromBody({ error: { code: 'X' } }, 'fb')).toBe('fb');
    expect(errorMessageFromBody(null, 'fb')).toBe('fb');
  });
});

describe('fetchMembershipsShared', () => {
  it('de-duplicates concurrent requests for the same gateway + token and decorates isActive', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (u: string) => {
      urls.push(u);
      await new Promise((r) => setTimeout(r, 5));
      return new Response(
        JSON.stringify({
          activeOrganizationId: 't1',
          activeWorkspaceId: 'w2',
          memberships: [{ team: { id: 't1' }, workspaces: [{ id: 'w1' }, { id: 'w2' }] }],
        }),
      );
    }) as any;
    const [a, b] = await Promise.all([
      fetchMembershipsShared('https://provider.test', 'tok'),
      fetchMembershipsShared('https://provider.test', 'tok'),
    ]);
    expect(urls).toEqual(['https://provider.test/api/auth/list_memberships']);
    expect(a).toBe(b);
    expect(a.memberships[0].workspaces.map((w) => w.isActive)).toEqual([false, true]);
    await fetchMembershipsShared('https://provider.test', 'tok');
    expect(urls.length).toBe(2); // cache is in-flight only
  });

  it('surfaces object error bodies as readable messages', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 403 })) as any;
    await expect(fetchMembershipsShared('', 'tok2')).rejects.toThrow('nope');
  });

  it('BillingMode includes vag_passthrough', () => {
    const mode: BillingMode = 'vag_passthrough';
    expect(mode).toBe('vag_passthrough');
  });
});
