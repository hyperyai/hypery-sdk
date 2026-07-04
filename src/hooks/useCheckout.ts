'use client';

/**
 * useCheckout — the seamless auth + charge flow.
 *
 * One action drives the whole chain: press-buy → (log in if needed) → charge →
 * (add a card if needed) → retry → done. Works two ways, chosen by
 * `config.interactionMode` (`auto` by default):
 *
 *   - popup:    each interactive step is a centered popup; the chain completes
 *               in-page without navigation (PayPal / Firebase signInWithPopup).
 *   - redirect: each step is a full-page redirect; the flow is persisted and
 *               auto-resumed when the user returns (robust on mobile / blocked
 *               popups). `auto` falls back to redirect there automatically.
 *
 * Covers two charge kinds:
 *   - `purchase` — a marketplace Connect charge (POST /api/marketplace/checkout).
 *   - `topup`    — buy AI credits (POST /api/wallet/topup).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHyperyAuth } from '../lib/context';
import { openPopup } from '../lib/popup';
import { parseError } from '../lib/parse-error';
import type { ParsedError } from '../types';

const PENDING_KEY = 'hypery_pending_checkout';
const MAX_ATTEMPTS = 3; // auth redirect + card redirect + margin; guards against loops
const CARD_POPUP_NAME = 'hypery-add-card';

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
    };

export type CheckoutStatus =
  | 'idle'
  | 'authenticating'
  | 'charging'
  | 'adding-card'
  | 'redirecting'
  | 'success'
  | 'error'
  | 'cancelled';

export interface CheckoutResult {
  status: 'success' | 'error' | 'cancelled' | 'redirecting';
  data?: any;
  error?: ParsedError;
}

export interface UseCheckoutReturn {
  /** Run the auth+charge flow. Resolves when the chain finishes (or is redirecting away). */
  checkout: (input: CheckoutInput) => Promise<CheckoutResult>;
  status: CheckoutStatus;
  isRunning: boolean;
  error: ParsedError | null;
}

const ENDPOINTS = {
  purchase: { charge: '/api/marketplace/checkout', cardSetup: '/api/buyer/wallet/checkout-setup' },
  topup: { charge: '/api/wallet/topup', cardSetup: '/api/payments/stripe/checkout-setup' },
} as const;

// Module-level guard so a redirect-resume runs exactly once per page load, even
// if several components mount useCheckout.
let resumeConsumed = false;

function readPending(): { input: CheckoutInput; attempts: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writePending(input: CheckoutInput, attempts: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ input, attempts }));
  } catch {
    /* storage may be unavailable; redirect resume just won't fire */
  }
}
function clearPending(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

function currentUrl(): string {
  return typeof window !== 'undefined' ? window.location.href : '';
}

function withIdempotency(input: CheckoutInput): CheckoutInput {
  if (input.kind === 'purchase' && !input.idempotencyKey) {
    const key =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `idem_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
    return { ...input, idempotencyKey: key };
  }
  return input;
}

export function useCheckout(): UseCheckoutReturn {
  const { isAuthenticated, isLoading, loginPopup, login, interactionMode, gatewayUrl, getAccessToken } =
    useHyperyAuth();
  const [status, setStatus] = useState<CheckoutStatus>('idle');
  const [error, setError] = useState<ParsedError | null>(null);
  const runningRef = useRef(false);

  const gatewayOrigin = (() => {
    try {
      return new URL(gatewayUrl).origin;
    } catch {
      return typeof window !== 'undefined' ? window.location.origin : '';
    }
  })();

  const authedFetch = useCallback(
    async (path: string, body: unknown): Promise<{ res: Response; body: any }> => {
      const token = await getAccessToken();
      const res = await fetch(`${gatewayUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const parsed = await res.json().catch(() => ({}));
      return { res, body: parsed };
    },
    [gatewayUrl, getAccessToken],
  );

  const chargeBody = (input: CheckoutInput) =>
    input.kind === 'purchase'
      ? {
          appId: input.appId,
          amountCents: input.amountCents,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
        }
      : { amount: input.usdAmount };

  /** Open the Stripe-hosted card-entry popup and wait for it to finish (or close). */
  const addCardPopup = useCallback(
    async (input: CheckoutInput): Promise<boolean> => {
      const { body } = await authedFetch(ENDPOINTS[input.kind].cardSetup, {
        successUrl: currentUrl(),
        cancelUrl: currentUrl(),
      });
      if (!body?.url) return false;
      const result = await openPopup<{ status?: string }>({
        url: body.url,
        name: CARD_POPUP_NAME,
        expectedOrigin: gatewayOrigin,
        messageType: 'hypery:payment-method',
      });
      if (result.blocked) return false; // caller falls back to redirect
      // Whether we got an explicit "added" message or the popup just closed, the
      // retry charge below is the source of truth (a 402 again ⇒ still no card).
      return !result.cancelled;
    },
    [authedFetch, gatewayOrigin],
  );

  /** Redirect to Stripe-hosted card entry, persisting the flow to resume on return. */
  const addCardRedirect = useCallback(
    async (input: CheckoutInput, attempts: number): Promise<void> => {
      const { body } = await authedFetch(ENDPOINTS[input.kind].cardSetup, {
        successUrl: currentUrl(),
        cancelUrl: currentUrl(),
      });
      if (body?.url && typeof window !== 'undefined') {
        writePending(input, attempts + 1);
        window.location.href = body.url;
      }
    },
    [authedFetch],
  );

  const runCheckout = useCallback(
    async (rawInput: CheckoutInput, attempts: number): Promise<CheckoutResult> => {
      if (runningRef.current) return { status: 'error', error: undefined };
      runningRef.current = true;
      setError(null);
      const input = withIdempotency(rawInput);

      try {
        // 1) Ensure authentication.
        if (!isAuthenticated) {
          setStatus('authenticating');
          if (interactionMode === 'popup') {
            const r = await loginPopup();
            if (r.cancelled) {
              setStatus('cancelled');
              return { status: 'cancelled' };
            }
            if (r.blocked) {
              // Popup blocked → fall back to a full-page redirect + resume.
              setStatus('redirecting');
              writePending(input, attempts + 1);
              await login();
              return { status: 'redirecting' };
            }
            // r.ok → fall through to charge (isAuthenticated updates async, but the
            // token is now in storage so getAccessToken() will return it).
          } else {
            setStatus('redirecting');
            writePending(input, attempts + 1);
            await login();
            return { status: 'redirecting' };
          }
        }

        // 2) Attempt the charge. Retry once after adding a card.
        for (let charge = 0; charge < 2; charge++) {
          setStatus('charging');
          const { res, body } = await authedFetch(ENDPOINTS[input.kind].charge, chargeBody(input));

          if (res.ok && body?.success !== false) {
            clearPending();
            setStatus('success');
            return { status: 'success', data: body };
          }

          const parsed = parseError({ ...body, status: res.status });

          // Needs a card → add one, then retry the charge once.
          if ((parsed.isPaymentMethodRequired || res.status === 402) && charge === 0) {
            setStatus('adding-card');
            if (interactionMode === 'popup') {
              const ok = await addCardPopup(input);
              if (!ok) {
                // Popup blocked/cancelled → redirect fallback (resumes on return).
                setStatus('redirecting');
                await addCardRedirect(input, attempts);
                return { status: 'redirecting' };
              }
              continue; // retry charge
            } else {
              setStatus('redirecting');
              await addCardRedirect(input, attempts);
              return { status: 'redirecting' };
            }
          }

          // Any other error is terminal for this flow.
          clearPending();
          setError(parsed);
          setStatus('error');
          return { status: 'error', error: parsed };
        }

        // Retried once after adding a card and still not ok.
        const fail = parseError({ code: 'PAYMENT_METHOD_REQUIRED', status: 402 });
        clearPending();
        setError(fail);
        setStatus('error');
        return { status: 'error', error: fail };
      } catch (err: any) {
        const parsed = parseError(err);
        clearPending();
        setError(parsed);
        setStatus('error');
        return { status: 'error', error: parsed };
      } finally {
        runningRef.current = false;
      }
    },
    [isAuthenticated, interactionMode, loginPopup, login, authedFetch, addCardPopup, addCardRedirect],
  );

  const checkout = useCallback(
    (input: CheckoutInput) => runCheckout(input, 0),
    [runCheckout],
  );

  // Redirect-mode resume: after the user returns from an auth or card redirect,
  // continue the persisted flow exactly once.
  useEffect(() => {
    if (resumeConsumed || isLoading) return;
    const pending = readPending();
    if (!pending) return;
    if (!isAuthenticated) return; // wait until the auth callback has set the user
    if (pending.attempts >= MAX_ATTEMPTS) {
      clearPending();
      return;
    }
    resumeConsumed = true;
    void runCheckout(pending.input, pending.attempts);
  }, [isAuthenticated, isLoading, runCheckout]);

  return { checkout, status, isRunning: status !== 'idle' && status !== 'success' && status !== 'error' && status !== 'cancelled', error };
}
