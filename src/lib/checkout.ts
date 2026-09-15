/**
 * Pure checkout helpers shared by useCheckout (kept React-free for testing).
 */

import type { ParsedError } from '../types';

/** How often a subscription is billed. Grants are issued monthly either way. */
export type PlanInterval = 'month' | 'year';

/** What `useCheckout().checkout()` should charge: a marketplace purchase, an AI-credit top-up, or a plan subscription. */
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
      /** Interval preselected on the hosted subscribe page (the user can change it there). */
      interval?: PlanInterval;
      /** @deprecated Ignored: the hosted subscribe page is idempotent per session. */
      idempotencyKey?: string;
    };

export const CHECKOUT_ENDPOINTS = {
  purchase: { charge: '/api/marketplace/checkout', cardSetup: '/api/buyer/wallet/checkout-setup' },
  topup: { charge: '/api/wallet/topup', cardSetup: '/api/payments/stripe/checkout-setup' },
} as const;

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `idem_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

/** Give purchases a stable idempotency key (persisted across redirect resume). */
export function withIdempotency(input: CheckoutInput): CheckoutInput {
  if (input.kind === 'purchase' && !input.idempotencyKey) {
    return { ...input, idempotencyKey: newIdempotencyKey() };
  }
  return input;
}

/** Request body for the charge endpoint of a purchase or top-up. */
export function chargeBody(input: Exclude<CheckoutInput, { kind: 'subscription' }>): Record<string, unknown> {
  switch (input.kind) {
    case 'purchase':
      return {
        appId: input.appId,
        amountCents: input.amountCents,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
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

// ---------------------------------------------------------------------------
// Hosted subscribe page (POST /api/marketplace/subscribe-sessions)
// ---------------------------------------------------------------------------

/** Endpoint that creates a hosted subscribe session. */
export const SUBSCRIBE_SESSIONS_PATH = '/api/marketplace/subscribe-sessions';
/** postMessage type the hosted subscribe page sends to its opener. */
export const SUBSCRIBE_MESSAGE_TYPE = 'hypery:subscribe';
/** Query params the hosted page appends when returning in redirect mode. */
export const SUBSCRIBE_RETURN_PARAMS = ['subscribe_session', 'state', 'subscribe_status'] as const;

/** Authoritative outcome endpoint for a subscribe session. */
export function subscribeResultPath(sessionId: string): string {
  return `${SUBSCRIBE_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/result`;
}

/** Fresh random state (hex, 48 chars) binding a session to this page. */
export function newSubscribeState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Origin of a URL, or null when it doesn't parse. */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Body for POST /api/marketplace/subscribe-sessions. Popup mode sends
 * `returnOrigin` (the origin of the configured redirectUri, which the gateway
 * requires to be a registered redirect URI origin); redirect mode sends `returnUrl`.
 */
export function subscribeSessionBody(
  input: { planId: string; interval?: PlanInterval },
  opts: { state: string } & ({ mode: 'popup'; redirectUri: string } | { mode: 'redirect'; returnUrl: string }),
): Record<string, unknown> {
  const body: Record<string, unknown> = { planId: input.planId, state: opts.state };
  if (input.interval) body.interval = input.interval;
  if (opts.mode === 'popup') {
    const origin = originOf(opts.redirectUri);
    if (!origin) throw new Error('config.redirectUri must be an absolute URL to open the subscribe popup');
    body.returnOrigin = origin;
  } else {
    body.returnUrl = opts.returnUrl;
  }
  return body;
}

/** Message the hosted subscribe page posts to `window.opener`. */
export interface SubscribeMessage {
  type: 'hypery:subscribe';
  sessionId: string;
  state: string;
  status: 'completed' | 'cancelled';
  teamId?: string;
  subscriptionId?: string;
}

/**
 * True only for a `hypery:subscribe` message from the gateway origin that
 * belongs to this session and carries the state we generated.
 */
export function isValidSubscribeMessage(
  event: { origin: string; data: unknown },
  expected: { origin: string; sessionId: string; state: string },
): event is { origin: string; data: SubscribeMessage } {
  if (event.origin !== expected.origin) return false;
  const d = event.data as Partial<SubscribeMessage> | null;
  return (
    !!d &&
    typeof d === 'object' &&
    d.type === SUBSCRIBE_MESSAGE_TYPE &&
    d.sessionId === expected.sessionId &&
    d.state === expected.state &&
    (d.status === 'completed' || d.status === 'cancelled')
  );
}

/** Parsed `?subscribe_session=&state=&subscribe_status=` from a redirect return. */
export interface SubscribeReturn {
  sessionId: string;
  state: string;
  status: 'completed' | 'cancelled' | null;
}

/** Read the hosted page's redirect-return params from a URL, or null when absent. */
export function parseSubscribeReturn(href: string): SubscribeReturn | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const sessionId = url.searchParams.get('subscribe_session');
  const state = url.searchParams.get('state');
  if (!sessionId || !state) return null;
  const s = url.searchParams.get('subscribe_status');
  return { sessionId, state, status: s === 'completed' || s === 'cancelled' ? s : null };
}

/** Remove the subscribe return params (so a reload doesn't re-process, and a new returnUrl stays clean). */
export function stripSubscribeParams(href: string): string {
  try {
    const url = new URL(href);
    for (const p of SUBSCRIBE_RETURN_PARAMS) url.searchParams.delete(p);
    return url.toString();
  } catch {
    return href;
  }
}

/** Body of GET /api/marketplace/subscribe-sessions/:id/result. */
export interface SubscribeSessionResult {
  status: 'pending' | 'completed' | 'cancelled' | 'expired';
  state: string;
  team: { id: string; name: string | null } | null;
  subscription: any | null;
}

/**
 * Map an authoritative session result to a checkout outcome. Success only when
 * the server says `completed` and the state matches; anything else is a cancel
 * (or an error on state mismatch).
 */
export function subscribeOutcome(
  result: Partial<SubscribeSessionResult> | null | undefined,
  expectedState: string,
): { status: 'success'; data: { subscription: any; team: SubscribeSessionResult['team'] } } | { status: 'cancelled' } | { status: 'error'; reason: 'STATE_MISMATCH' } {
  if (!result || result.state !== expectedState) return { status: 'error', reason: 'STATE_MISMATCH' };
  if (result.status === 'completed') {
    return { status: 'success', data: { subscription: result.subscription ?? null, team: result.team ?? null } };
  }
  return { status: 'cancelled' };
}
