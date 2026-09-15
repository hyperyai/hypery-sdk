import { describe, expect, it } from 'bun:test';
import {
  isValidSubscribeMessage,
  newSubscribeState,
  parseSubscribeReturn,
  stripSubscribeParams,
  subscribeOutcome,
  subscribeResultPath,
  subscribeSessionBody,
} from '../checkout';

const GATEWAY = 'https://hypery.ai';

describe('subscribe session body', () => {
  it('popup mode sends returnOrigin derived from redirectUri, plus state and interval', () => {
    expect(
      subscribeSessionBody({ planId: 'p1', interval: 'year' }, { state: 'abcdefgh1', mode: 'popup', redirectUri: 'https://app.example.com:8443/auth/callback?x=1' }),
    ).toEqual({ planId: 'p1', interval: 'year', state: 'abcdefgh1', returnOrigin: 'https://app.example.com:8443' });
  });

  it('redirect mode sends returnUrl and omits interval when unset', () => {
    expect(subscribeSessionBody({ planId: 'p1' }, { state: 'abcdefgh1', mode: 'redirect', returnUrl: 'https://app.example.com/pricing' })).toEqual({
      planId: 'p1',
      state: 'abcdefgh1',
      returnUrl: 'https://app.example.com/pricing',
    });
  });

  it('rejects a relative redirectUri in popup mode', () => {
    expect(() => subscribeSessionBody({ planId: 'p' }, { state: 'abcdefgh1', mode: 'popup', redirectUri: '/callback' })).toThrow();
  });

  it('generates random state within the server length bounds', () => {
    const a = newSubscribeState();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(newSubscribeState()).not.toBe(a);
  });

  it('builds the result path', () => {
    expect(subscribeResultPath('s/1')).toBe('/api/marketplace/subscribe-sessions/s%2F1/result');
  });
});

describe('subscribe message validation', () => {
  const expected = { origin: GATEWAY, sessionId: 'sess1', state: 'state-123' };
  const data = { type: 'hypery:subscribe', sessionId: 'sess1', state: 'state-123', status: 'completed', teamId: 't1' };

  it('accepts the matching message', () => {
    expect(isValidSubscribeMessage({ origin: GATEWAY, data }, expected)).toBe(true);
    expect(isValidSubscribeMessage({ origin: GATEWAY, data: { ...data, status: 'cancelled' } }, expected)).toBe(true);
  });

  it('rejects foreign origins, state/session mismatches, wrong type and bad status', () => {
    expect(isValidSubscribeMessage({ origin: 'https://evil.example', data }, expected)).toBe(false);
    expect(isValidSubscribeMessage({ origin: GATEWAY, data: { ...data, state: 'other-state' } }, expected)).toBe(false);
    expect(isValidSubscribeMessage({ origin: GATEWAY, data: { ...data, sessionId: 'sess2' } }, expected)).toBe(false);
    expect(isValidSubscribeMessage({ origin: GATEWAY, data: { ...data, type: 'hypery:auth' } }, expected)).toBe(false);
    expect(isValidSubscribeMessage({ origin: GATEWAY, data: { ...data, status: 'done' } }, expected)).toBe(false);
    expect(isValidSubscribeMessage({ origin: GATEWAY, data: null }, expected)).toBe(false);
  });
});

describe('redirect return', () => {
  const href = 'https://app.example.com/pricing?tab=pro&subscribe_session=sess1&state=st-12345678&subscribe_status=completed#plans';

  it('parses the return params', () => {
    expect(parseSubscribeReturn(href)).toEqual({ sessionId: 'sess1', state: 'st-12345678', status: 'completed' });
    expect(parseSubscribeReturn('https://app.example.com/pricing?subscribe_session=s&state=x&subscribe_status=weird')?.status).toBeNull();
  });

  it('returns null without a session or state', () => {
    expect(parseSubscribeReturn('https://app.example.com/pricing?state=x')).toBeNull();
    expect(parseSubscribeReturn('https://app.example.com/?subscribe_session=s')).toBeNull();
    expect(parseSubscribeReturn('not a url')).toBeNull();
  });

  it('strips only the subscribe params, keeping others and the hash', () => {
    expect(stripSubscribeParams(href)).toBe('https://app.example.com/pricing?tab=pro#plans');
  });
});

describe('subscribe outcome', () => {
  it('succeeds only on completed with matching state', () => {
    const team = { id: 't1', name: 'Acme' };
    expect(subscribeOutcome({ status: 'completed', state: 's', team, subscription: { id: 'sub' } }, 's')).toEqual({
      status: 'success',
      data: { subscription: { id: 'sub' }, team },
    });
    for (const status of ['cancelled', 'pending', 'expired'] as const) {
      expect(subscribeOutcome({ status, state: 's', team: null, subscription: null }, 's')).toEqual({ status: 'cancelled' });
    }
    expect(subscribeOutcome({ status: 'completed', state: 'other', team: null, subscription: null }, 's')).toEqual({ status: 'error', reason: 'STATE_MISMATCH' });
  });
});

describe('subscribeSessionBody teamId', () => {
  const opts = { state: 'abcdefgh1', mode: 'redirect' as const, returnUrl: 'https://app.example.com/pricing' };
  it('omits teamId when not given', () => {
    expect(subscribeSessionBody({ planId: 'p1' }, opts)).not.toHaveProperty('teamId');
  });
  it('includes a valid teamId', () => {
    expect(subscribeSessionBody({ planId: 'p1', teamId: '0123456789abcdefABCDEF01' }, opts)).toMatchObject({ planId: 'p1', teamId: '0123456789abcdefABCDEF01' });
  });
  it('throws a clear error on an invalid teamId', () => {
    for (const bad of ['', 'team_1', '0123456789abcdef0123456', '0123456789abcdef012345678', 'zz23456789abcdef01234567']) {
      expect(() => subscribeSessionBody({ planId: 'p1', teamId: bad }, opts)).toThrow(/Invalid teamId/);
    }
  });
});
