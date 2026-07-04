import { afterEach, describe, expect, it } from 'bun:test';
import { resolveInteractionMode } from '../popup';
import { parseError } from '../parse-error';

function setUA(ua: string | undefined) {
  if (ua === undefined) {
    // @ts-expect-error test shim
    delete (globalThis as any).navigator;
    return;
  }
  (globalThis as any).navigator = { userAgent: ua };
}

describe('resolveInteractionMode', () => {
  const realNav = (globalThis as any).navigator;
  afterEach(() => {
    (globalThis as any).navigator = realNav;
  });

  it('honors an explicit popup/redirect choice regardless of environment', () => {
    setUA('iPhone'); // mobile — but explicit wins
    expect(resolveInteractionMode('popup')).toBe('popup');
    expect(resolveInteractionMode('redirect')).toBe('redirect');
  });

  it('auto → popup on desktop', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 Chrome/124 Safari/537.36');
    expect(resolveInteractionMode('auto')).toBe('popup');
    expect(resolveInteractionMode(undefined)).toBe('popup'); // default is auto
  });

  it('auto → redirect on mobile (iOS / Android)', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile/15E148 Safari/604');
    expect(resolveInteractionMode('auto')).toBe('redirect');
    setUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36');
    expect(resolveInteractionMode('auto')).toBe('redirect');
  });

  it('auto → redirect when navigator is unavailable (SSR)', () => {
    setUA(undefined);
    expect(resolveInteractionMode('auto')).toBe('redirect');
  });
});

describe('parseError.isAuth (needsAuth signal)', () => {
  it('flags UNAUTHENTICATED / 401 as an auth error', () => {
    expect(parseError({ error: { code: 'UNAUTHENTICATED', type: 'authentication_error', message: 'x' } }).isAuth).toBe(true);
    expect(parseError({ status: 401 }).isAuth).toBe(true);
  });
  it('does not flag a payment-method error as auth', () => {
    const p = parseError({ error: { code: 'PAYMENT_METHOD_REQUIRED', type: 'payment_method_required_error', message: 'x' }, status: 402 });
    expect(p.isAuth).toBe(false);
    expect(p.isPaymentMethodRequired).toBe(true);
  });
});
