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
 * Covers three charge kinds:
 *   - `purchase`     — a marketplace Connect charge (POST /api/marketplace/checkout).
 *   - `topup`        — buy AI credits (POST /api/wallet/topup).
 *   - `subscription` — subscribe to an app plan on Hypery's hosted subscribe page
 *                      (POST /api/marketplace/subscribe-sessions; the user picks team,
 *                      card and interval there; outcome verified via /result).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHyperyAuth } from '../lib/context';
import { closePopup, openBlankPopup, openPopup } from '../lib/popup';
import { parseError } from '../lib/parse-error';
import type { ParsedError } from '../types';
import {
  CHECKOUT_ENDPOINTS as ENDPOINTS,
  chargeBody,
  isValidSubscribeMessage,
  subscribePreopenNeeded,
  needsCard,
  newSubscribeState,
  parseSubscribeReturn,
  stripSubscribeParams,
  subscribeOutcome,
  subscribeResultPath,
  subscribeSessionBody,
  SUBSCRIBE_MESSAGE_TYPE,
  SUBSCRIBE_SESSIONS_PATH,
  withIdempotency,
  type CheckoutInput,
} from '../lib/checkout';

export type { CheckoutInput, SubscribeSessionResult } from '../lib/checkout';

const PENDING_KEY = 'hypery_pending_checkout';
const MAX_ATTEMPTS = 3; // auth redirect + card redirect + margin; guards against loops
const CARD_POPUP_NAME = 'hypery-add-card';
const SUBSCRIBE_POPUP_NAME = 'hypery-subscribe';
const SUBSCRIBE_PENDING_KEY = 'hypery_pending_subscribe';

/** Current step of the checkout flow. */
export type CheckoutStatus =
  | 'idle'
  | 'authenticating'
  | 'charging'
  | 'adding-card'
  | 'subscribing'
  | 'redirecting'
  | 'success'
  | 'error'
  | 'cancelled';

/**
 * Outcome of `checkout()`. On a gateway error `data` carries the raw response
 * body. A successful subscription's `data` is `{ subscription, team }` from the
 * session result.
 */
export interface CheckoutResult {
  status: 'success' | 'error' | 'cancelled' | 'redirecting';
  data?: any;
  error?: ParsedError;
}

/** Return value of {@link useCheckout}. */
export interface UseCheckoutReturn {
  /** Run the auth+charge flow. Resolves when the chain finishes (or is redirecting away). */
  checkout: (input: CheckoutInput) => Promise<CheckoutResult>;
  status: CheckoutStatus;
  isRunning: boolean;
  error: ParsedError | null;
  /** Outcome of the last finished flow, including one resumed after a redirect return. */
  lastResult: CheckoutResult | null;
}

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

interface PendingSubscribe {
  sessionId: string;
  state: string;
  input: CheckoutInput;
}
function readPendingSubscribe(): PendingSubscribe | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SUBSCRIBE_PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writePendingSubscribe(p: PendingSubscribe): void {
  try {
    window.localStorage.setItem(SUBSCRIBE_PENDING_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable; the return can't be verified */
  }
}
function clearPendingSubscribe(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SUBSCRIBE_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

let subscribeResumeConsumed = false;

function currentUrl(): string {
  return typeof window !== 'undefined' ? window.location.href : '';
}

/**
 * Run the auth + charge flow (log in, charge, add a card if needed, retry) as
 * popups or redirects per `config.interactionMode`.
 *
 * @example
 * ```tsx
 * const { checkout, isRunning } = useCheckout();
 * await checkout({ kind: 'topup', usdAmount: 20 });
 * ```
 * @see docs/CHECKOUT.md
 */
export function useCheckout(): UseCheckoutReturn {
  const { isAuthenticated, isLoading, loginPopup, login, interactionMode, gatewayUrl, getAccessToken, redirectUri } =
    useHyperyAuth();
  const [status, setStatus] = useState<CheckoutStatus>('idle');
  const [error, setError] = useState<ParsedError | null>(null);
  const [lastResult, setLastResult] = useState<CheckoutResult | null>(null);
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

  const authedGet = useCallback(
    async (path: string): Promise<{ res: Response; body: any }> => {
      const token = await getAccessToken();
      const res = await fetch(`${gatewayUrl}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return { res, body: await res.json().catch(() => ({})) };
    },
    [gatewayUrl, getAccessToken],
  );

  /** Fetch the authoritative session result and map it to a CheckoutResult. */
  const finishSubscribe = useCallback(
    async (sessionId: string, state: string): Promise<CheckoutResult> => {
      const { res, body } = await authedGet(subscribeResultPath(sessionId));
      if (!res.ok || body?.success === false) {
        const parsed = parseError({ ...body, status: res.status });
        return { status: 'error', error: parsed, data: body };
      }
      const outcome = subscribeOutcome(body, state);
      if (outcome.status === 'error') {
        return { status: 'error', error: parseError({ error: { code: outcome.reason, message: 'Subscribe session state mismatch' } }) };
      }
      return outcome;
    },
    [authedGet],
  );

  /** Create a hosted subscribe session and navigate this page to it. */
  const subscribeRedirect = useCallback(
    async (input: Extract<CheckoutInput, { kind: 'subscription' }>): Promise<CheckoutResult> => {
      const state = newSubscribeState();
      const { res, body } = await authedFetch(
        SUBSCRIBE_SESSIONS_PATH,
        subscribeSessionBody(input, { state, mode: 'redirect', returnUrl: stripSubscribeParams(currentUrl()) }),
      );
      if (!res.ok || !body?.url || !body?.sessionId) {
        return { status: 'error', error: parseError({ ...body, status: res.status }), data: body };
      }
      writePendingSubscribe({ sessionId: body.sessionId, state, input });
      window.location.href = body.url;
      return { status: 'redirecting' };
    },
    [authedFetch],
  );

  /** Hosted subscribe page in a popup; falls back to redirect when blocked. */
  const runSubscribe = useCallback(
    async (
      input: Extract<CheckoutInput, { kind: 'subscription' }>,
      preopened: Window | null | undefined,
    ): Promise<CheckoutResult> => {
      setStatus('subscribing');
      // Redirect mode, or the synchronously pre-opened window was blocked (null).
      if (interactionMode !== 'popup' || preopened === null || preopened?.closed) {
        closePopup(preopened);
        setStatus('redirecting');
        return subscribeRedirect(input);
      }
      const state = newSubscribeState();
      let res: Response;
      let body: any;
      try {
        ({ res, body } = await authedFetch(
          SUBSCRIBE_SESSIONS_PATH,
          subscribeSessionBody(input, { state, mode: 'popup', redirectUri }),
        ));
      } catch (err) {
        closePopup(preopened);
        throw err;
      }
      if (!res.ok || !body?.url || !body?.sessionId) {
        closePopup(preopened);
        return { status: 'error', error: parseError({ ...body, status: res.status }), data: body };
      }
      const sessionId: string = body.sessionId;
      if (preopened?.closed) return { status: 'cancelled' }; // user closed the loading window
      const popup = await openPopup({
        existing: preopened,
        url: body.url,
        name: SUBSCRIBE_POPUP_NAME,
        expectedOrigin: gatewayOrigin,
        messageType: SUBSCRIBE_MESSAGE_TYPE,
        width: 480,
        height: 760,
        accept: (event) => isValidSubscribeMessage(event, { origin: gatewayOrigin, sessionId, state }),
      });
      if (popup.blocked) {
        setStatus('redirecting');
        return subscribeRedirect(input);
      }
      if (popup.cancelled) return { status: 'cancelled' };
      return finishSubscribe(sessionId, state);
    },
    [interactionMode, authedFetch, redirectUri, gatewayOrigin, subscribeRedirect, finishSubscribe],
  );

  /** Open the Stripe-hosted card-entry popup and wait for it to finish (or close). */
  const addCardPopup = useCallback(
    async (input: Exclude<CheckoutInput, { kind: 'subscription' }>): Promise<boolean> => {
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
    async (input: Exclude<CheckoutInput, { kind: 'subscription' }>, attempts: number): Promise<void> => {
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
      // Pre-open the subscribe popup synchronously (still inside the user gesture)
      // when no login step comes first; null means the browser blocked it.
      const preopened: Window | null | undefined = subscribePreopenNeeded(input.kind, interactionMode, isAuthenticated)
        ? openBlankPopup(SUBSCRIBE_POPUP_NAME, 480, 760)
        : undefined;

      try {
        // 1) Ensure authentication.
        if (!isAuthenticated) {
          setStatus('authenticating');
          if (interactionMode === 'popup') {
            const r = await loginPopup();
            if (r.cancelled) {
              closePopup(preopened);
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

        // 2a) Subscriptions run on Hypery's hosted subscribe page.
        if (input.kind === 'subscription') {
          clearPending();
          const r = await runSubscribe(input, preopened);
          if (r.status === 'error') setError(r.error ?? null);
          setStatus(r.status);
          if (r.status !== 'redirecting') setLastResult(r);
          return r;
        }

        // 2) Attempt the charge. Retry once after adding a card.
        for (let charge = 0; charge < 2; charge++) {
          setStatus('charging');
          const { res, body } = await authedFetch(ENDPOINTS[input.kind].charge, chargeBody(input));

          if (res.ok && body?.success !== false) {
            clearPending();
            setStatus('success');
            setLastResult({ status: 'success', data: body });
            return { status: 'success', data: body };
          }

          const parsed = parseError({ ...body, status: res.status });

          // Needs a card → add one, then retry the charge once.
          if (needsCard(parsed, res.status) && charge === 0) {
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

          // Any other error is terminal for this flow. The raw body rides along so
          // callers can act on details (e.g. a subscription's SCA clientSecret).
          clearPending();
          setError(parsed);
          setStatus('error');
          return { status: 'error', error: parsed, data: body };
        }

        // Retried once after adding a card and still not ok.
        const fail = parseError({ code: 'PAYMENT_METHOD_REQUIRED', status: 402 });
        clearPending();
        setError(fail);
        setStatus('error');
        return { status: 'error', error: fail };
      } catch (err: any) {
        closePopup(preopened);
        const parsed = parseError(err);
        clearPending();
        setError(parsed);
        setStatus('error');
        return { status: 'error', error: parsed };
      } finally {
        runningRef.current = false;
      }
    },
    [isAuthenticated, interactionMode, loginPopup, login, authedFetch, addCardPopup, addCardRedirect, runSubscribe],
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

  // Hosted subscribe redirect return: verify state, fetch the result, clean the URL.
  useEffect(() => {
    if (subscribeResumeConsumed || isLoading || typeof window === 'undefined') return;
    const ret = parseSubscribeReturn(window.location.href);
    if (!ret) return;
    const pending = readPendingSubscribe();
    if (!pending || pending.sessionId !== ret.sessionId) return; // not ours
    if (!isAuthenticated) return;
    subscribeResumeConsumed = true;
    clearPendingSubscribe();
    try {
      window.history.replaceState(window.history.state, '', stripSubscribeParams(window.location.href));
    } catch {
      /* ignore */
    }
    void (async () => {
      let r: CheckoutResult;
      if (ret.state !== pending.state) {
        r = { status: 'error', error: parseError({ error: { code: 'STATE_MISMATCH', message: 'Subscribe session state mismatch' } }) };
      } else {
        setStatus('subscribing');
        try {
          r = await finishSubscribe(pending.sessionId, pending.state);
        } catch (err) {
          r = { status: 'error', error: parseError(err) };
        }
      }
      if (r.status === 'error') setError(r.error ?? null);
      setStatus(r.status === 'redirecting' ? 'idle' : r.status);
      setLastResult(r);
    })();
  }, [isAuthenticated, isLoading, finishSubscribe]);

  return { checkout, lastResult, status, isRunning: status !== 'idle' && status !== 'success' && status !== 'error' && status !== 'cancelled', error };
}
