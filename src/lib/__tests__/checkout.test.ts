import { describe, expect, it } from 'bun:test';
import { CHECKOUT_ENDPOINTS, chargeBody, intervalSwitchPath, needsCard, planPriceCents, subscribeSessionBody, withIdempotency } from '../checkout';
import { parseError } from '../parse-error';

describe('checkout helpers', () => {
  it('no longer routes subscriptions through the charge/card-setup endpoints', () => {
    expect('subscription' in CHECKOUT_ENDPOINTS).toBe(false);
  });

  it('gives purchases a stable idempotency key, keeps a supplied one, leaves top-ups and subscriptions alone', () => {
    expect(withIdempotency({ kind: 'subscription', planId: 'plan_1' })).toEqual({ kind: 'subscription', planId: 'plan_1' });
    expect(withIdempotency({ kind: 'purchase', appId: 'a', amountCents: 1, idempotencyKey: 'mine-123' })).toMatchObject({ idempotencyKey: 'mine-123' });
    expect(withIdempotency({ kind: 'purchase', appId: 'a', amountCents: 100 })).toHaveProperty('idempotencyKey');
    expect(withIdempotency({ kind: 'topup', usdAmount: 5 })).toEqual({ kind: 'topup', usdAmount: 5 });
  });

  it('builds the charge body per kind', () => {
    expect(chargeBody({ kind: 'topup', usdAmount: 10 })).toEqual({ amount: 10 });
    expect(chargeBody({ kind: 'purchase', appId: 'a', amountCents: 50, idempotencyKey: 'k' })).toMatchObject({ appId: 'a', amountCents: 50 });
  });

  it('only sends the user to add a card when a card would help', () => {
    const e = (code: string) => parseError({ error: { code }, status: 402 });
    expect(needsCard(e('PAYMENT_METHOD_REQUIRED'), 402)).toBe(true);
    expect(needsCard(parseError({ status: 402 }), 402)).toBe(true);
    expect(needsCard(e('PAYMENT_INCOMPLETE'), 402)).toBe(false);
    expect(needsCard(e('PAYMENT_DECLINED'), 402)).toBe(false);
    expect(needsCard(e('SUBSCRIPTION_IN_PROGRESS'), 409)).toBe(false);
  });

  it('keeps a subscription interval preselection through redirect persistence', () => {
    const input = withIdempotency({ kind: 'subscription', planId: 'p', interval: 'year' });
    const resumed = JSON.parse(JSON.stringify({ sessionId: 's', state: 'x', input })).input;
    expect(subscribeSessionBody(resumed, { state: 'abcdefgh', mode: 'redirect', returnUrl: 'https://a.example/' })).toMatchObject({ planId: 'p', interval: 'year' });
  });

  it('builds the interval switch path', () => {
    expect(intervalSwitchPath('sub/1')).toBe('/api/marketplace/subscriptions/sub%2F1/interval');
  });

  it('resolves a plan price per interval with legacy fallback', () => {
    const plan = { priceCents: 1000, interval: 'month' as const, prices: [{ interval: 'month' as const, priceCents: 1000 }, { interval: 'year' as const, priceCents: 10000 }] };
    expect(planPriceCents(plan, 'year')).toBe(10000);
    expect(planPriceCents(plan)).toBe(1000);
    expect(planPriceCents({ ...plan, prices: [plan.prices[0]] }, 'year')).toBeNull();
    expect(planPriceCents({ priceCents: 500, interval: 'month' }, 'month')).toBe(500);
    expect(planPriceCents({ priceCents: 500, interval: 'month' }, 'year')).toBeNull();
  });
});
