/**
 * Run: bun test src/lib/__tests__/parse-error.test.ts
 */
import { describe, expect, it } from 'bun:test';
import { parseError } from '../parse-error';

describe('parseError billing', () => {
  it('classifies PAYMENT_METHOD_REQUIRED', () => {
    const p = parseError({
      error: { code: 'PAYMENT_METHOD_REQUIRED', message: 'need card', action: 'add_payment_method' },
      status: 402,
    });
    expect(p.isPaymentMethodRequired).toBe(true);
    expect(p.isInsufficientCredits).toBe(false);
  });

  it('does not map bare 402 to INSUFFICIENT_CREDITS', () => {
    const p = parseError({ status: 402 });
    expect(p.code).toBe('PAYMENT_METHOD_REQUIRED');
    expect(p.isPaymentMethodRequired).toBe(true);
    expect(p.isInsufficientCredits).toBe(false);
  });

  it('keeps INSUFFICIENT_CREDITS when coded', () => {
    const p = parseError({
      error: { code: 'INSUFFICIENT_CREDITS', message: 'broke' },
      status: 402,
    });
    expect(p.isInsufficientCredits).toBe(true);
  });

  it('passes through VAG_BILLING_NOT_CONFIGURED without calling it credits', () => {
    const p = parseError({
      error: { code: 'VAG_BILLING_NOT_CONFIGURED', message: 'no price' },
      status: 402,
    });
    expect(p.code).toBe('VAG_BILLING_NOT_CONFIGURED');
    expect(p.isInsufficientCredits).toBe(false);
  });
});
