'use client';

/**
 * useAppSubscription — the signed-in user's subscription to your app's plans.
 *
 * Loads the app's active plans (GET /api/marketplace/plans) and the user's
 * subscriptions with their remaining app-scoped credit grants
 * (GET /api/marketplace/subscriptions), and exposes subscribe / cancel / resume.
 * `subscribe` runs the full useCheckout chain (log in → subscribe → add a card
 * only if the user has none on Hypery → retry).
 *
 * Plans are created by the app developer in the Hypery dashboard; a plan's price
 * and its credit grants are configured independently.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHyperyAuth } from '../lib/context';
import { parseError } from '../lib/parse-error';
import type { ParsedError } from '../types';
import { useCheckout, type CheckoutResult } from './useCheckout';
import { intervalSwitchPath, type PlanInterval } from '../lib/checkout';

export type { PlanInterval } from '../lib/checkout';

export interface AppPlanPrice {
  interval: PlanInterval;
  priceCents: number;
}

export interface AppPlanGrant {
  type: 'hypery' | 'stripe';
  amountUsd: number;
  expiresAfterDays: number;
  issueOn: 'each_payment' | 'first_payment_only';
}

export interface AppPlan {
  id: string;
  appId: string;
  name: string;
  description: string | null;
  /** Monthly price (legacy field; see `prices` for every offered interval). */
  priceCents: number;
  currency: string;
  interval: PlanInterval;
  /** Active prices, one per offered interval. Absent on older gateways. */
  prices?: AppPlanPrice[];
  grants: AppPlanGrant[];
}

export interface AppSubscriptionGrantBalance {
  type: 'hypery' | 'stripe';
  amountUsd: number;
  remainingUsd: number;
  expiresAt: string;
}

export interface AppSubscription {
  id: string;
  appId: string;
  plan: AppPlan | null;
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  /** How the subscription is billed. Annual subscribers still receive grants monthly. */
  interval?: PlanInterval;
  /** A scheduled interval switch (year→month applies at period end), or null. */
  pendingInterval?: PlanInterval | null;
  /** When the next monthly grant is issued, or null. */
  nextGrantAt?: string | null;
  grants: AppSubscriptionGrantBalance[];
}

export interface SwitchIntervalResult {
  success: boolean;
  /** False when nothing changed (already on that interval, no pending switch). */
  changed: boolean;
  /** month→year is charged `now`; year→month takes effect at `period_end`. */
  effective?: 'now' | 'period_end';
  at?: string;
  subscription?: AppSubscription;
  error?: ParsedError;
}

export interface UseAppSubscriptionReturn {
  plans: AppPlan[];
  subscriptions: AppSubscription[];
  /** The user's live subscription (active / trialing / past_due), if any. */
  activeSubscription: AppSubscription | null;
  /** True while a live subscription exists. */
  isSubscribed: boolean;
  /** Unexpired grant value remaining across the live subscription, in USD. */
  remainingCreditUsd: number;
  /** Billing interval of the live subscription, if any. */
  interval: PlanInterval | null;
  /** Scheduled interval switch on the live subscription, if any. */
  pendingInterval: PlanInterval | null;
  /** When the live subscription's next monthly grant is issued. */
  nextGrantAt: string | null;
  isLoading: boolean;
  error: ParsedError | null;
  refresh: () => Promise<void>;
  /** Subscribe to a plan (login / add-card handled). Refreshes on success. */
  subscribe: (planId: string, opts?: { idempotencyKey?: string; interval?: PlanInterval }) => Promise<CheckoutResult>;
  /** Stop renewal at period end (issued grants stay usable until they expire). */
  cancel: (subscriptionId?: string) => Promise<boolean>;
  /** Undo a pending cancellation. */
  resume: (subscriptionId?: string) => Promise<boolean>;
  /**
   * Switch billing interval. month→year charges now (may fail with PAYMENT_DECLINED);
   * year→month applies at period end. Passing the current interval while a switch
   * is pending cancels it. Omit `subscriptionId` (or pass undefined) for the live subscription.
   */
  switchInterval: (subscriptionId: string | undefined, interval: PlanInterval) => Promise<SwitchIntervalResult>;
}

const LIVE = new Set(['active', 'trialing', 'past_due']);

export function useAppSubscription(appId: string): UseAppSubscriptionReturn {
  const { authenticatedFetch, gatewayUrl, isAuthenticated, isLoading: authLoading } = useHyperyAuth();
  const { checkout } = useCheckout();
  const [plans, setPlans] = useState<AppPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<AppSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ParsedError | null>(null);

  const refresh = useCallback(async () => {
    if (!appId || !isAuthenticated) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const q = encodeURIComponent(appId);
      const [plansRes, subsRes] = await Promise.all([
        authenticatedFetch(`${gatewayUrl}/api/marketplace/plans?appId=${q}`),
        authenticatedFetch(`${gatewayUrl}/api/marketplace/subscriptions?appId=${q}`),
      ]);
      const [plansBody, subsBody] = await Promise.all([
        plansRes.json().catch(() => ({})),
        subsRes.json().catch(() => ({})),
      ]);
      if (!plansRes.ok) throw { ...plansBody, status: plansRes.status };
      if (!subsRes.ok) throw { ...subsBody, status: subsRes.status };
      setPlans(plansBody.plans ?? []);
      setSubscriptions(subsBody.subscriptions ?? []);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setIsLoading(false);
    }
  }, [appId, authenticatedFetch, gatewayUrl, isAuthenticated]);

  useEffect(() => {
    if (!authLoading) void refresh();
  }, [authLoading, refresh]);

  const activeSubscription = useMemo(
    () => subscriptions.find((s) => LIVE.has(s.status)) ?? null,
    [subscriptions],
  );
  const remainingCreditUsd = useMemo(
    () => (activeSubscription?.grants ?? []).reduce((sum, g) => sum + g.remainingUsd, 0),
    [activeSubscription],
  );

  const subscribe = useCallback(
    async (planId: string, opts?: { idempotencyKey?: string; interval?: PlanInterval }) => {
      const result = await checkout({
        kind: 'subscription',
        planId,
        idempotencyKey: opts?.idempotencyKey,
        ...(opts?.interval ? { interval: opts.interval } : {}),
      });
      if (result.status === 'success') await refresh();
      return result;
    },
    [checkout, refresh],
  );

  const setRenewal = useCallback(
    async (action: 'cancel' | 'resume', subscriptionId?: string) => {
      const id = subscriptionId ?? activeSubscription?.id;
      if (!id) return false;
      const res = await authenticatedFetch(`${gatewayUrl}/api/marketplace/subscriptions/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(parseError({ ...body, status: res.status }));
        return false;
      }
      await refresh();
      return true;
    },
    [activeSubscription, authenticatedFetch, gatewayUrl, refresh],
  );

  const switchInterval = useCallback(
    async (subscriptionId: string | undefined, interval: PlanInterval): Promise<SwitchIntervalResult> => {
      const id = subscriptionId ?? activeSubscription?.id;
      if (!id) return { success: false, changed: false };
      const res = await authenticatedFetch(`${gatewayUrl}${intervalSwitchPath(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        const parsed = parseError({ ...body, status: res.status });
        setError(parsed);
        return { success: false, changed: false, error: parsed };
      }
      await refresh();
      return { ...body, success: true, changed: !!body?.changed };
    },
    [activeSubscription, authenticatedFetch, gatewayUrl, refresh],
  );

  return {
    plans,
    subscriptions,
    activeSubscription,
    isSubscribed: !!activeSubscription,
    remainingCreditUsd,
    interval: activeSubscription?.interval ?? (activeSubscription ? 'month' : null),
    pendingInterval: activeSubscription?.pendingInterval ?? null,
    nextGrantAt: activeSubscription?.nextGrantAt ?? null,
    isLoading,
    error,
    refresh,
    subscribe,
    cancel: (id) => setRenewal('cancel', id),
    resume: (id) => setRenewal('resume', id),
    switchInterval,
  };
}
