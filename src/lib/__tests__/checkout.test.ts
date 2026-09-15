import { describe, expect, it } from 'bun:test';
import { CHECKOUT_ENDPOINTS, chargeBody, needsCard, withIdempotency } from '../checkout';
import { parseError } from '../parse-error';

describe('checkout helpers', () => {
  it('routes subscriptions to the subscribe endpoint with buyer-wallet card entry', () => {
    expect(CHECKOUT_ENDPOINTS.subscription).toEqual({
      charge: '/api/marketplace/subscribe',
      cardSetup: '/api/buyer/wallet/checkout-setup',
    });
  });

  it('gives purchases and subscriptions a stable idempotency key, keeps a supplied one, leaves top-ups alone', () => {
    const sub = withIdempotency({ kind: 'subscription', planId: 'plan_1' });
    expect(sub.kind === 'subscription' && typeof sub.idempotencyKey).toBe('string');
    expect(withIdempotency({ kind: 'subscription', planId: 'p', idempotencyKey: 'mine-123' })).toMatchObject({ idempotencyKey: 'mine-123' });
    expect(withIdempotency({ kind: 'purchase', appId: 'a', amountCents: 100 })).toHaveProperty('idempotencyKey');
    expect(withIdempotency({ kind: 'topup', usdAmount: 5 })).toEqual({ kind: 'topup', usdAmount: 5 });
  });

  it('builds the charge body per kind', () => {
    expect(chargeBody({ kind: 'subscription', planId: 'p', idempotencyKey: 'k' })).toEqual({ planId: 'p', idempotencyKey: 'k' });
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
});
