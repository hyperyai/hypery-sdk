/**
 * Pure checkout helpers shared by useCheckout (kept React-free for testing).
 */

import type { ParsedError } from '../types';

/** How often a subscription is billed. Grants are issued monthly either way. */
export type PlanInterval = 'month' | 'year';

export type CheckoutInput =
  | {
      kind: 'purchase';
      appId: string;
      amountCents: number;
      description?: string;
      /** Stable key so a resumed/retried charge is not double-billed. Auto-generated if omitted. */
      idempotencyKey?: string;
    }
  | {
      kind: 'topup';
      /** USD amount of credits to buy. */
      usdAmount: number;
    }
  | {
      kind: 'subscription';
      /** An active plan of the app your OAuth client belongs to. */
      planId: string;
      /** Billing interval to subscribe on. Defaults to `'month'` server-side. Must be one the plan offers. */
      interval?: PlanInterval;
      /** Stable key so a resumed/retried subscribe never creates two subscriptions. Auto-generated if omitted. */
      idempotencyKey?: string;
    };

export const CHECKOUT_ENDPOINTS = {
  purchase: { charge: '/api/marketplace/checkout', cardSetup: '/api/buyer/wallet/checkout-setup' },
  topup: { charge: '/api/wallet/topup', cardSetup: '/api/payments/stripe/checkout-setup' },
  subscription: { charge: '/api/marketplace/subscribe', cardSetup: '/api/buyer/wallet/checkout-setup' },
} as const;

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `idem_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

/** Give purchases and subscriptions a stable idempotency key (persisted across redirect resume). */
export function withIdempotency(input: CheckoutInput): CheckoutInput {
  if ((input.kind === 'purchase' || input.kind === 'subscription') && !input.idempotencyKey) {
    return { ...input, idempotencyKey: newIdempotencyKey() };
  }
  return input;
}

/** Request body for the charge endpoint of each checkout kind. */
export function chargeBody(input: CheckoutInput): Record<string, unknown> {
  switch (input.kind) {
    case 'purchase':
      return {
        appId: input.appId,
        amountCents: input.amountCents,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
      };
    case 'subscription':
      return {
        planId: input.planId,
        idempotencyKey: input.idempotencyKey,
        ...(input.interval ? { interval: input.interval } : {}),
      };
    case 'topup':
      return { amount: input.usdAmount };
  }
}

/**
 * 402s that a new card will NOT fix: the card needs authentication
 * (PAYMENT_INCOMPLETE) or was declined. Adding a card for those would loop the
 * user through card entry for nothing, so they're surfaced as errors instead.
 */
const NOT_FIXED_BY_A_CARD = new Set(['PAYMENT_INCOMPLETE', 'PAYMENT_DECLINED']);

export function needsCard(parsed: ParsedError, status: number): boolean {
  if (parsed.isPaymentMethodRequired) return true;
  return status === 402 && !NOT_FIXED_BY_A_CARD.has(String(parsed.code ?? ''));
}

/** Endpoint that switches a subscription's billing interval. */
export function intervalSwitchPath(subscriptionId: string): string {
  return `/api/marketplace/subscriptions/${encodeURIComponent(subscriptionId)}/interval`;
}

/**
 * Price of a plan at a given interval, in cents. Reads `prices` when the server
 * sends it and falls back to the legacy monthly `priceCents`/`interval` fields.
 * Returns null when the plan doesn't offer that interval.
 */
export function planPriceCents(
  plan: { priceCents?: number; interval?: PlanInterval; prices?: { interval: PlanInterval; priceCents: number }[] },
  interval: PlanInterval = 'month',
): number | null {
  if (plan.prices?.length) return plan.prices.find((p) => p.interval === interval)?.priceCents ?? null;
  return plan.priceCents !== undefined && (plan.interval ?? 'month') === interval ? plan.priceCents : null;
}
