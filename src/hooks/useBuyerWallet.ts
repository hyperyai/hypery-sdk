/**
 * Buyer wallet hook for the "buy with Hypery" marketplace layer.
 *
 * Reads the buyer's saved payment methods from the gateway
 * (GET /api/buyer/wallet) and exposes an `addCard` action that starts the
 * Stripe-hosted card-entry flow (POST /api/buyer/wallet/checkout-setup) and
 * redirects the browser to it.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useHyperyAuth } from "../lib/context";
import { parseError } from "../lib/parse-error";
import type { ParsedError } from "../types";

export interface BuyerPaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface AddCardOptions {
  /** Where Stripe returns after a successful card add. Defaults to current URL. */
  successUrl?: string;
  /** Where Stripe returns if the buyer cancels. Defaults to current URL. */
  cancelUrl?: string;
}

export interface UseBuyerWalletReturn {
  paymentMethods: BuyerPaymentMethod[];
  hasDefault: boolean;
  isLoading: boolean;
  error: ParsedError | null;
  /** Re-fetch the buyer wallet snapshot. */
  refresh: () => Promise<void>;
  /**
   * Start Stripe-hosted card entry and redirect the browser to it.
   * `successUrl`/`cancelUrl` default to the current location.
   */
  addCard: (opts?: AddCardOptions) => Promise<void>;
}

function currentLocation(): string {
  return typeof window !== "undefined" ? window.location.href : "";
}

export function useBuyerWallet(): UseBuyerWalletReturn {
  const { authenticatedFetch, gatewayUrl } = useHyperyAuth();

  const [paymentMethods, setPaymentMethods] = useState<BuyerPaymentMethod[]>(
    [],
  );
  const [hasDefault, setHasDefault] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ParsedError | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch(`${gatewayUrl}/api/buyer/wallet`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(parseError({ ...body, status: res.status }));
        setPaymentMethods([]);
        setHasDefault(false);
        return;
      }
      setPaymentMethods(
        Array.isArray(body?.paymentMethods) ? body.paymentMethods : [],
      );
      setHasDefault(Boolean(body?.hasDefault));
    } catch (err) {
      setError(parseError(err));
      setPaymentMethods([]);
      setHasDefault(false);
    } finally {
      setIsLoading(false);
    }
  }, [authenticatedFetch, gatewayUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addCard = useCallback(
    async (opts: AddCardOptions = {}) => {
      const successUrl = opts.successUrl ?? currentLocation();
      const cancelUrl = opts.cancelUrl ?? currentLocation();

      const res = await authenticatedFetch(
        `${gatewayUrl}/api/buyer/wallet/checkout-setup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ successUrl, cancelUrl }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) {
        throw new Error(
          body?.error?.message || `Could not start card entry: ${res.status}`,
        );
      }
      if (typeof window !== "undefined") {
        window.location.href = body.url as string;
      }
    },
    [authenticatedFetch, gatewayUrl],
  );

  return { paymentMethods, hasDefault, isLoading, error, refresh, addCard };
}
