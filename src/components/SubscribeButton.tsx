/**
 * SubscribeButton — subscribe the user to one of your app's plans via Hypery.
 *
 * Runs the flow through {@link useCheckout}: logs the user in if needed, then
 * opens Hypery's hosted subscribe page where the user picks the team, card and
 * interval. Like BuyButton it asks for an explicit confirmation first. Never throws.
 */

"use client";

import type React from "react";
import { useState } from "react";
import { useCheckout, type CheckoutResult } from "../hooks/useCheckout";
import type { BrandingConfig, ParsedError } from "../types";

/** Props of {@link SubscribeButton}. */
export interface SubscribeButtonProps {
  /** Plan id (from useAppSubscription().plans or GET /api/marketplace/plans). */
  planId: string;
  /** Price shown on the button, in cents (display only — Hypery charges the plan's price). */
  priceCents?: number;
  /**
   * Billing interval to subscribe on (also shown next to the price). Defaults to
   * monthly. Pass `"year"` for annual billing — the plan must offer a yearly price.
   */
  interval?: "month" | "year";
  /** Button label. Defaults to "Subscribe" (+ price when given). */
  label?: React.ReactNode;
  /** Require a confirming second click before subscribing. Defaults to true. */
  requireConfirmation?: boolean;
  /** Called on success with `{ subscription, team }` from the session result. */
  onSuccess?: (data: any) => void;
  /** Called for failures (session creation, result fetch, `STATE_MISMATCH`). */
  onError?: (error: ParsedError, result: CheckoutResult) => void;
  className?: string;
  branding?: BrandingConfig;
}

function priceText(priceCents?: number, interval?: "month" | "year"): string {
  if (priceCents === undefined) return "";
  return ` · $${(priceCents / 100).toFixed(2)}${interval ? `/${interval === "month" ? "mo" : "yr"}` : ""}`;
}

/**
 * Subscribe the user to one of your app's plans (login handled; card entry happens on the hosted page).
 *
 * @example
 * ```tsx
 * <SubscribeButton planId={plan.id} priceCents={plan.priceCents} interval="month" />
 * ```
 */
export function SubscribeButton({
  planId,
  priceCents,
  interval,
  label,
  requireConfirmation = true,
  onSuccess,
  onError,
  className = "",
  branding,
}: SubscribeButtonProps) {
  const { checkout, isRunning } = useCheckout();
  const [armed, setArmed] = useState(false);

  const run = async () => {
    setArmed(false);
    const result = await checkout({ kind: "subscription", planId, ...(interval ? { interval } : {}) });
    if (result.status === "success") {
      onSuccess?.(result.data);
      return;
    }
    if (result.status === "error" && result.error) onError?.(result.error, result);
  };

  const handleClick = () => {
    if (requireConfirmation && !armed) {
      setArmed(true);
      return;
    }
    void run();
  };

  const primaryColor = branding?.primaryColor;
  const style = primaryColor ? { backgroundColor: primaryColor } : undefined;
  const price = priceText(priceCents, interval);
  const buttonLabel = isRunning ? "Processing…" : armed ? `Confirm${price}` : (label ?? `Subscribe${price}`);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isRunning}
        style={style}
        className={`
        inline-flex items-center justify-center gap-2
        px-6 py-2.5 text-base rounded-lg font-medium transition-all
        text-white shadow-md hover:shadow-lg
        ${primaryColor ? "" : "bg-purple-600 hover:bg-purple-700"}
        disabled:opacity-60 disabled:cursor-not-allowed
        ${className}
      `}
      >
        {isRunning && (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden="true"
          />
        )}
        {buttonLabel}
      </button>
      {armed && !isRunning && (
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="px-3 py-2.5 text-sm rounded-lg font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
      )}
    </span>
  );
}
