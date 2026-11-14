/**
 * Run: bun test src/components/__tests__/billing-page-url.test.ts
 */
import { describe, expect, it } from 'bun:test';
import { billingPageUrl } from '../RestrictionModal';

const wallet = {
  settingsUrls: {
    billing: '/settings/acme/billing',
    topup: '/settings/acme/billing/topup',
    addPaymentMethod: '/settings/acme/billing/add-payment-method',
  },
};
const gw = 'https://hypery.ai/';

describe('billingPageUrl', () => {
  it("uses the 402's own hosted link for adding a card, with no wallet access", () => {
    const url = 'https://hypery.ai/settings/team-x/billing/add-payment-method';
    expect(billingPageUrl('addPaymentMethod', { url }, null, gw)).toBe(url);
  });

  it("prefers the error's link over the wallet's for card and credits", () => {
    const url = 'https://hypery.ai/settings/team-x/billing/topup';
    expect(billingPageUrl('topup', { url }, wallet, gw)).toBe(url);
  });

  it('falls back to the wallet page, made absolute against the gateway', () => {
    expect(billingPageUrl('addPaymentMethod', null, wallet, gw)).toBe('https://hypery.ai/settings/acme/billing/add-payment-method');
  });

  it('opens the general billing page from the wallet first', () => {
    expect(billingPageUrl('billing', { url: 'https://hypery.ai/x' }, wallet, gw)).toBe('https://hypery.ai/settings/acme/billing');
  });

  it('returns null when there is nowhere to go', () => {
    expect(billingPageUrl('topup', null, null, gw)).toBeNull();
  });
});
