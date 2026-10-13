'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { WalletState } from '../hooks/useWallet.js';
import { errorMessageFromBody } from '../lib/gateway.js';
import { Check, CreditCard, Gauge, X } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { ErrorNote, ROOT, Spinner, buttonSizes, buttonVariants } from './ui/primitives.js';

/**
 * Flat error object accepted by {@link RestrictionModal}: `code`/`message`
 * plus the code-specific fields spread at the top level.
 */
export interface RestrictionError {
  code: string;
  message: string;
  type?: string;
  // Spending limit specific
  limitType?: 'daily' | 'monthly' | 'total';
  limit?: number;
  current?: number;
  requested?: number;
  resetsAt?: string;
  // Insufficient credits specific
  available?: number;
  required?: number;
  // Generic extensible fields
  [key: string]: any;
}

interface RestrictionModalProps {
  /** Error to resolve; `null` hides the modal. */
  error: RestrictionError | null;
  /** OAuth clientId of the app making the requests. Preferred name. */
  clientId?: string;
  /**
   * @deprecated Use `clientId` instead. This prop is actually the OAuth clientId,
   * not the DB app id. Kept as a backward-compatible alias.
   */
  appId?: string;
  /** Hypery base URL. */
  gatewayUrl: string;
  /** Usually `useAuth().getAccessToken`. */
  getAccessToken: () => Promise<string | null>;
  /** Close handler. */
  onClose: () => void;
  /** Retry the blocked request. */
  onRetry?: () => void;
  /** Called after funds/card are successfully added. */
  onFunded?: () => void;
  className?: string;
  overlayClassName?: string;
}

const QUICK_AMOUNTS = [10, 25, 50];

/**
 * Mode-aware restriction / funds modal.
 *
 * Reads the team's wallet state (GET /api/wallet/state) and renders the CTA that
 * matches the billing lever:
 *   - metered + no card → "Add a payment method" (Stripe-hosted Checkout)
 *   - metered + declined → "Update payment method"
 *   - prepaid           → 1-click "Add $X" (charges the saved card in place)
 */
export function RestrictionModal({
  error,
  clientId,
  appId,
  gatewayUrl,
  getAccessToken,
  onClose,
  onRetry,
  onFunded,
  className = '',
  overlayClassName = '',
}: RestrictionModalProps) {
  // `appId` is a deprecated alias for `clientId`; prefer `clientId` when both are set.
  const resolvedClientId = clientId ?? appId;
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [funded, setFunded] = useState(false);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (resolvedClientId) headers['X-Hypery-Client-Id'] = resolvedClientId;
    return headers;
  }, [getAccessToken, resolvedClientId]);

  const loadWallet = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);
      const headers = await authHeaders();
      const res = await fetch(`${gatewayUrl}/api/wallet/state`, { headers });
      if (!res.ok) throw new Error(`Failed to load wallet (${res.status})`);
      setWallet((await res.json()) as WalletState);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load wallet');
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, gatewayUrl]);

  useEffect(() => {
    if (!error) return;
    void loadWallet();
  }, [error, loadWallet]);

  // 1-click: charge the saved card and credit the team.
  const addFunds = useCallback(
    async (usd: number) => {
      setBusy(true);
      setActionError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch(`${gatewayUrl}/api/wallet/topup`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ amount: usd }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.success) {
          throw new Error(errorMessageFromBody(body, `Top-up failed (${res.status})`));
        }
        await loadWallet();
        setFunded(true);
        onFunded?.();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Top-up failed');
      } finally {
        setBusy(false);
      }
    },
    [authHeaders, gatewayUrl, loadWallet, onFunded]
  );

  // Stripe-hosted Checkout (setup) in a popup — no Stripe Elements here.
  const addPaymentMethod = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${gatewayUrl}/api/payments/stripe/checkout-setup`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) {
        throw new Error(errorMessageFromBody(body, `Could not start checkout (${res.status})`));
      }

      const popup = window.open(body.url, 'hypery-add-card', 'width=480,height=720');

      const added = await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('message', onMessage);
          clearInterval(poll);
          resolve(ok);
        };
        // Only trust the completion message from the gateway's own origin.
        const expectedOrigin = (() => {
          try {
            return new URL(gatewayUrl).origin;
          } catch {
            return typeof window !== 'undefined' ? window.location.origin : '';
          }
        })();
        const onMessage = (event: MessageEvent) => {
          if (event.origin !== expectedOrigin) return;
          if (event?.data?.type === 'hypery:payment-method') {
            finish(event.data.status === 'added');
          }
        };
        window.addEventListener('message', onMessage);
        const poll = setInterval(() => {
          if (popup && popup.closed) finish(false);
        }, 700);
      });

      await loadWallet();
      if (added) onFunded?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add payment method');
    } finally {
      setBusy(false);
    }
  }, [authHeaders, gatewayUrl, loadWallet, onFunded]);

  if (!error) return null;

  const openSettings = (path?: string) => {
    if (!path) return;
    window.open(`${gatewayUrl}${path}`, '_blank');
  };

  const isSpendingLimit = error.code === 'SPENDING_LIMIT_EXCEEDED';
  const isPaymentDeclined = error.code === 'PAYMENT_DECLINED';
  const isPaymentMethodRequired = error.code === 'PAYMENT_METHOD_REQUIRED';

  const title = funded
    ? 'You’re all set'
    : isPaymentMethodRequired
    ? 'Add a payment method'
    : isPaymentDeclined
    ? 'Payment failed'
    : isSpendingLimit
    ? 'Spending limit reached'
    : 'Add funds';

  const mode = wallet?.mode;
  // metered and vag_passthrough both bill the card for usage (no prepaid balance).
  const isPayAsYouGo = mode === 'metered' || mode === 'vag_passthrough';
  const hasCard = !!wallet?.paymentMethod?.exists;

  const primary = cn(buttonVariants.primary, buttonSizes.xl, 'hy:w-full');
  const secondary = cn(buttonVariants.secondary, buttonSizes.xl, 'hy:w-full');
  const quiet = cn(buttonVariants.ghost, buttonSizes.md, 'hy:w-full');

  return (
    <div
      className={cn(
        ROOT,
        'hy:fixed hy:inset-0 hy:z-50 hy:flex hy:items-center hy:justify-center hy:bg-overlay hy:p-4 hy:backdrop-blur-[2px] hy:animate-hy-overlay-in',
        overlayClassName,
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hypery-restriction-title"
        className={cn(
          'hy:relative hy:w-full hy:max-w-md hy:animate-hy-pop-in hy:rounded-2xl hy:bg-popover hy:p-7 hy:text-popover-foreground hy:shadow-xl',
          className,
        )}
      >
        <button
          onClick={onClose}
          className="hy:absolute hy:right-3.5 hy:top-3.5 hy:z-10 hy:inline-flex hy:size-8 hy:items-center hy:justify-center hy:rounded-md hy:text-subtle-foreground hy:transition-colors hy:outline-none hy:hover:bg-accent hy:hover:text-foreground hy:focus-visible:ring-[3px] hy:focus-visible:ring-ring/50"
          aria-label="Close"
        >
          <X aria-hidden className="hy:size-4" />
        </button>

        <div className="hy:mb-5 hy:flex hy:flex-col hy:items-center hy:gap-3 hy:text-center">
          <span
            className={cn(
              'hy:flex hy:size-11 hy:items-center hy:justify-center hy:rounded-full hy:[&_svg]:size-5',
              funded
                ? 'hy:bg-success-subtle hy:text-success-foreground'
                : isSpendingLimit
                ? 'hy:bg-warning-subtle hy:text-warning-foreground'
                : 'hy:bg-primary-subtle hy:text-primary-subtle-foreground',
            )}
          >
            {funded ? <Check aria-hidden /> : isSpendingLimit ? <Gauge aria-hidden /> : <CreditCard aria-hidden />}
          </span>
          <h2 id="hypery-restriction-title" className="hy:text-xl hy:font-semibold hy:tracking-tight">
            {title}
          </h2>
          {!funded && !isLoading && (
            <p className="hy:text-sm hy:text-muted-foreground">{error.message}</p>
          )}
        </div>

        {isLoading && (
          <div className="hy:flex hy:items-center hy:justify-center hy:gap-3 hy:py-8 hy:text-sm hy:text-muted-foreground">
            <Spinner className="hy:size-5 hy:text-primary" />
            Loading your account…
          </div>
        )}

        {!isLoading && (
          <div className="hy:flex hy:flex-col hy:gap-4">
            {/* Wallet summary */}
            {wallet && (
              <div className="hy:rounded-xl hy:bg-surface-sunken hy:p-4">
                <div className="hy:flex hy:items-baseline hy:justify-between">
                  <span className="hy:text-sm hy:text-muted-foreground">Available credits</span>
                  <span className="hy:text-2xl hy:font-semibold hy:tabular-nums hy:tracking-tight">
                    {wallet.balance.current}
                  </span>
                </div>
                <div className="hy:mt-1 hy:flex hy:items-center hy:justify-between hy:text-xs hy:text-subtle-foreground">
                  <span>{isPayAsYouGo ? 'Pay-as-you-go billing' : 'Prepaid balance'}</span>
                  {wallet.paymentMethod.exists && (
                    <span className="hy:tabular-nums">
                      {wallet.paymentMethod.brand} •••• {wallet.paymentMethod.last4}
                    </span>
                  )}
                </div>
              </div>
            )}

            {fetchError && <ErrorNote>{fetchError}</ErrorNote>}
            {actionError && <ErrorNote>{actionError}</ErrorNote>}

            {/* Actions */}
            <div className="hy:flex hy:flex-col hy:gap-2">
              {funded ? (
                <button
                  onClick={() => {
                    onRetry?.();
                    onClose();
                  }}
                  className={primary}
                >
                  Continue
                </button>
              ) : isSpendingLimit ? (
                <>
                  <button onClick={() => openSettings(wallet?.settingsUrls.billing)} className={primary}>
                    Manage spending limits
                  </button>
                  {onRetry && (
                    <button onClick={onRetry} className={secondary}>
                      Try again
                    </button>
                  )}
                </>
              ) : isPayAsYouGo || !hasCard || isPaymentMethodRequired || isPaymentDeclined ? (
                // Metered, or no card on file → capture/update a card first.
                <>
                  <button onClick={addPaymentMethod} disabled={busy} className={primary}>
                    {busy && <Spinner />}
                    {busy ? 'Opening secure checkout…' : hasCard ? 'Update payment method' : 'Add a payment method'}
                  </button>
                  {isPayAsYouGo && (
                    <p className="hy:text-center hy:text-xs hy:text-subtle-foreground">
                      You’ll be billed automatically as you use the service.
                    </p>
                  )}
                  {onRetry && (
                    <button onClick={onRetry} className={quiet}>
                      Try again
                    </button>
                  )}
                </>
              ) : (
                // Prepaid + card on file → 1-click add funds.
                <>
                  <div className="hy:grid hy:grid-cols-3 hy:gap-2">
                    {QUICK_AMOUNTS.map((usd) => (
                      <button
                        key={usd}
                        onClick={() => addFunds(usd)}
                        disabled={busy}
                        className={cn(buttonVariants.primary, buttonSizes.xl, 'hy:tabular-nums')}
                      >
                        ${usd}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => openSettings(wallet?.settingsUrls.topup)} className={quiet}>
                    Other amount…
                  </button>
                </>
              )}

              {!funded && (
                <button onClick={onClose} className={quiet}>
                  Close
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
