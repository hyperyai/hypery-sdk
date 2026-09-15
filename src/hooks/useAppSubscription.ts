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
  priceCents: number;
  currency: string;
  interval: 'month' | 'year';
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
  grants: AppSubscriptionGrantBalance[];
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
  isLoading: boolean;
  error: ParsedError | null;
  refresh: () => Promise<void>;
  /** Subscribe to a plan (login / add-card handled). Refreshes on success. */
  subscribe: (planId: string, opts?: { idempotencyKey?: string }) => Promise<CheckoutResult>;
  /** Stop renewal at period end (issued grants stay usable until they expire). */
  cancel: (subscriptionId?: string) => Promise<boolean>;
  /** Undo a pending cancellation. */
  resume: (subscriptionId?: string) => Promise<boolean>;
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
    async (planId: string, opts?: { idempotencyKey?: string }) => {
      const result = await checkout({ kind: 'subscription', planId, idempotencyKey: opts?.idempotencyKey });
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

  return {
    plans,
    subscriptions,
    activeSubscription,
    isSubscribed: !!activeSubscription,
    remainingCreditUsd,
    isLoading,
    error,
    refresh,
    subscribe,
    cancel: (id) => setRenewal('cancel', id),
    resume: (id) => setRenewal('resume', id),
  };
}
