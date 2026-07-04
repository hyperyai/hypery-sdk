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
import { type BuySuccess } from "../hooks/useMarketplace";
import { useCheckout } from "../hooks/useCheckout";
import type { BrandingConfig, ParsedError } from "../types";

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

  const primaryColor = branding?.primaryColor;
  const style = primaryColor ? { backgroundColor: primaryColor } : undefined;

  const idleLabel = label ?? `Buy · ${formatUsd(amountCents)}`;
  const buttonLabel = busy
    ? "Processing…"
    : armed
      ? `Confirm · ${formatUsd(amountCents)}`
      : idleLabel;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
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
        {busy && (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden="true"
          />
        )}
        {buttonLabel}
      </button>
      {armed && !busy && (
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
