/**
 * BuyButton — "buy with Hypery" marketplace checkout button.
 *
 * On click it runs the full auth+charge flow via {@link useCheckout}: it logs
 * the buyer in if needed, charges, and adds a card if none is on file — each
 * step as a popup or a redirect per `config.interactionMode` (`auto` by default).
 * So an unauthenticated visitor can click Buy and be walked through login → card
 * → charge without leaving the page (popup mode). Never throws.
 */

"use client";

import type React from "react";
import { useState } from "react";
import { type BuySuccess } from "../hooks/useMarketplace.js";
import { useCheckout } from "../hooks/useCheckout.js";
import type { BrandingConfig, ParsedError } from "../types/index.js";
import { cn } from "../lib/utils.js";
import { ROOT, Spinner, brandStyle, buttonSizes, buttonVariants } from "./ui/primitives.js";

/** Props of {@link BuyButton}. */
export interface BuyButtonProps {
  /** Seller app the purchase is credited to. */
  appId: string;
  /** Amount to charge the buyer, in cents. */
  amountCents: number;
  /** Optional human-readable description of the purchase. */
  description?: string;
  /** Button label. Defaults to a price-formatted "Buy · $X.XX". */
  label?: React.ReactNode;
  /**
   * Require an explicit per-transaction confirmation before charging (the card
   * is charged off-session, so this gives the buyer a clear "yes"). Defaults to
   * true: the first click arms the button ("Confirm · $X.XX" + Cancel), the
   * second click charges. Set false to charge on a single click.
   */
  requireConfirmation?: boolean;
  /** Called with the successful checkout result. */
  onSuccess?: (result: BuySuccess) => void;
  /** Called with a classified error for failures other than needs-a-card. */
  onError?: (error: ParsedError) => void;
  /** Custom className appended to the button. */
  className?: string;
  /** Optional branding (primaryColor is used as the button color). */
  branding?: BrandingConfig;
}

function formatUsd(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

/**
 * Drop-in checkout button for the Hypery marketplace.
 *
 * @example
 * ```tsx
 * <BuyButton appId="app_123" amountCents={499} description="Pro upgrade"
 *   onSuccess={(r) => console.log('paid', r.paymentIntentId)} />
 * ```
 */
export function BuyButton({
  appId,
  amountCents,
  description,
  label,
  onSuccess,
  onError,
  className = "",
  branding,
  requireConfirmation = true,
}: BuyButtonProps) {
  const { checkout, isRunning } = useCheckout();
  const [armed, setArmed] = useState(false);

  const busy = isRunning;

  const charge = async () => {
    setArmed(false);
    // Runs login → charge → add-card → retry as needed (popup or redirect).
    const result = await checkout({ kind: "purchase", appId, amountCents, description });

    if (result.status === "success") {
      const b = result.data || {};
      onSuccess?.({
        ok: true,
        paymentIntentId: b.paymentIntentId,
        status: b.status,
        amountCents: b.amountCents ?? amountCents,
        applicationFeeCents: b.applicationFeeCents ?? 0,
      } as BuySuccess);
      return;
    }
    // 'redirecting' (navigating away, resumes on return) and 'cancelled' (user
    // closed a popup) are not errors — stay quiet.
    if (result.status === "error" && result.error) {
      onError?.(result.error);
    }
  };

  const handleClick = () => {
    if (requireConfirmation && !armed) {
      setArmed(true);
      return;
    }
    void charge();
  };


  const idleLabel = label ?? `Buy · ${formatUsd(amountCents)}`;
  const buttonLabel = busy
    ? "Processing…"
    : armed
      ? `Confirm · ${formatUsd(amountCents)}`
      : idleLabel;

  return (
    <span className={cn(ROOT, "hy:inline-flex hy:items-center hy:gap-2")} style={brandStyle(branding?.primaryColor)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={cn(buttonVariants.primary, buttonSizes.lg, className)}
      >
        {busy && <Spinner />}
        {buttonLabel}
      </button>
      {armed && !busy && (
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
