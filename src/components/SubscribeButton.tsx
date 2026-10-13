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
import { useCheckout, type CheckoutResult } from "../hooks/useCheckout.js";
import type { BrandingConfig, ParsedError } from "../types/index.js";
import { cn } from "../lib/utils.js";
import { ROOT, Spinner, brandStyle, buttonSizes, buttonVariants } from "./ui/primitives.js";

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
  /** Lock the hosted subscribe page to this Hypery team (24-hex id). Omit to let the user pick. */
  teamId?: string;
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
  teamId,
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
    const result = await checkout({ kind: "subscription", planId, ...(interval ? { interval } : {}), ...(teamId ? { teamId } : {}) });
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

  const price = priceText(priceCents, interval);
  const buttonLabel = isRunning ? "Processing…" : armed ? `Confirm${price}` : (label ?? `Subscribe${price}`);

  return (
    <span className={cn(ROOT, "hy:inline-flex hy:items-center hy:gap-2")} style={brandStyle(branding?.primaryColor)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isRunning}
        className={cn(buttonVariants.primary, buttonSizes.lg, className)}
      >
        {isRunning && <Spinner />}
        {buttonLabel}
      </button>
      {armed && !isRunning && (
        <button
          type="button"
          onClick={() => setArmed(false)}
          className={cn(buttonVariants.ghost, buttonSizes.lg)}
        >
          Cancel
        </button>
      )}
    </span>
  );
}
