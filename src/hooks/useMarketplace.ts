/**
 * Marketplace hook for the "buy with Hypery" layer (Stripe Connect).
 *
 * Runs a marketplace checkout against the gateway
 * (POST /api/marketplace/checkout). Expected billing errors (no card on file,
 * card declined, seller not onboarded, ...) are returned as a discriminated
 * result — this hook never throws for them.
 */

"use client";

import { useCallback, useState } from "react";
import { useHyperyAuth } from "../lib/context";
import { isPaymentMethodRequiredError, parseError } from "../lib/parse-error";
import type { ParsedError } from "../types";

export interface BuyInput {
  /** Seller app the purchase is credited to. */
  appId: string;
  /** Amount to charge the buyer, in cents. */
  amountCents: number;
  /** Optional human-readable description of the purchase. */
  description?: string;
  /** Optional specific saved card (pm_...). Defaults to the buyer's default. */
  paymentMethodId?: string;
  /**
   * Optional idempotency key to make retries safe. Pass a STABLE value per
   * logical purchase (e.g. an order id) so a user-initiated retry of the same
   * purchase does not charge twice. If omitted, a fresh key is generated per
   * call — which still protects against the SDK's internal auth-refresh retry,
   * but not against a fresh second call for the same order.
   */
  idempotencyKey?: string;
}

/** Best-effort unique idempotency token (browser crypto with a fallback). */
function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return `mkt_${c.randomUUID()}`;
  return `mkt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export interface BuySuccess {
  ok: true;
  paymentIntentId: string;
  status: string;
  amountCents: number;
  applicationFeeCents: number;
}

export interface BuyFailure {
  ok: false;
  error: ParsedError;
  /** True when the buyer has no card and must add one before retrying. */
  needsPaymentMethod: boolean;
  /** True when the caller is not authenticated and must log in before retrying. */
  needsAuth: boolean;
}

export type BuyResult = BuySuccess | BuyFailure;

export interface UseMarketplaceReturn {
  /** Run a marketplace checkout. Never throws for expected billing errors. */
  buy: (input: BuyInput) => Promise<BuyResult>;
  isBuying: boolean;
  lastError: ParsedError | null;
}

export function useMarketplace(): UseMarketplaceReturn {
  const { authenticatedFetch, gatewayUrl } = useHyperyAuth();

  const [isBuying, setIsBuying] = useState(false);
  const [lastError, setLastError] = useState<ParsedError | null>(null);

  const buy = useCallback(
    async (input: BuyInput): Promise<BuyResult> => {
      setIsBuying(true);
      setLastError(null);

      const fail = (raw: unknown): BuyFailure => {
        const error = parseError(raw);
        setLastError(error);
        return {
          ok: false,
          error,
          needsPaymentMethod: isPaymentMethodRequiredError(raw),
          needsAuth: error.isAuth,
        };
      };

      try {
        const res = await authenticatedFetch(
          `${gatewayUrl}/api/marketplace/checkout`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              appId: input.appId,
              amountCents: input.amountCents,
              description: input.description,
              paymentMethodId: input.paymentMethodId,
              idempotencyKey: input.idempotencyKey ?? newIdempotencyKey(),
            }),
          },
        );
        const body = await res.json().catch(() => ({}));

        if (!res.ok || !body?.success) {
          return fail({ ...body, status: res.status });
        }

        return {
          ok: true,
          paymentIntentId: body.paymentIntentId,
          status: body.status,
          amountCents: body.amountCents,
          applicationFeeCents: body.applicationFeeCents,
        };
      } catch (err) {
        return fail(err);
      } finally {
        setIsBuying(false);
      }
    },
    [authenticatedFetch, gatewayUrl],
  );

  return { buy, isBuying, lastError };
}
