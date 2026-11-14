'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { WalletState } from '../hooks/useWallet.js';
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

/** A hosted HyperY billing page. */
export type BillingPage = 'addPaymentMethod' | 'topup' | 'billing';

/**
 * Where to send someone to fix a billing restriction: HyperY's hosted page, signed in as them, so the app needs no
 * billing scope. The error's own `url` (HyperY's 402s carry the hosted page for the paying team) wins for adding a
 * card or credits; the wallet's `settingsUrls` fill in, and win for the general billing page.
 */
export function billingPageUrl(
  kind: BillingPage,
  error: { [key: string]: unknown } | null,
  wallet: Pick<WalletState, 'settingsUrls'> | null,
  gatewayUrl: string,
): string | null {
  const fromError = typeof error?.url === 'string' && error.url ? error.url : null;
  const path = wallet?.settingsUrls?.[kind] ?? null;
  const url = kind === 'billing' ? path ?? fromError : fromError ?? path;
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `${gatewayUrl.replace(/\/+$/, '')}${url}`;
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
  /**
   * The HyperY team paying, when the app lets people pick one. Sent as `x-hypery-active-organization-id` so the
   * wallet shown is that team's. Omit for the person's own account.
   */
  activeOrganizationId?: string | null;
  /** Close handler. */
  onClose: () => void;
  /** Retry the blocked request. */
  onRetry?: () => void;
  /** Called after funds/card are successfully added. */
  onFunded?: () => void;
  className?: string;
  overlayClassName?: string;
}

/**
 * Mode-aware restriction / funds modal.
 *
 * Adding a card or credits happens on HyperY's own hosted billing pages, opened in a popup and signed in as the
 * person. So the app needs no billing scope: no `billing:write` (apps can't be granted it), and not even
 * `billing:read`. The page comes from the error itself (HyperY's 402s carry `url`, the hosted page for the paying
 * team), else from the wallet's `settingsUrls`.
 *
 * When the token can read the wallet (`billing:read`), it also shows the balance and card, and picks the action:
 *   - pay-as-you-go, no card, card required or declined → "Add / Update payment method"
 *   - prepaid with a card → "Add credits"
 */
export function RestrictionModal({
  error,
  clientId,
  appId,
  gatewayUrl,
  getAccessToken,
  activeOrganizationId,
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
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [funded, setFunded] = useState(false);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (resolvedClientId) headers['X-Hypery-Client-Id'] = resolvedClientId;
    if (activeOrganizationId) headers['x-hypery-active-organization-id'] = activeOrganizationId;
    return headers;
  }, [getAccessToken, resolvedClientId, activeOrganizationId]);

  // Optional: the balance and card on file. Needs `billing:read`; without it the modal still works off the
  // error's own `url`, so a failed read isn't shown as an error.
  const loadWallet = useCallback(async (): Promise<WalletState | null> => {
    try {
      setIsLoading(true);
      const res = await fetch(`${gatewayUrl}/api/wallet/state`, { headers: await authHeaders() });
      const next = res.ok ? ((await res.json()) as WalletState) : null;
      setWallet(next);
      return next;
    } catch {
      setWallet(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, gatewayUrl]);

  useEffect(() => {
    if (!error) return;
    setFunded(false);
    setActionError(null);
    void loadWallet();
  }, [error, loadWallet]);

  const hostedUrl = (kind: BillingPage) => billingPageUrl(kind, error, wallet, gatewayUrl);

  // Open a hosted page in a popup and wait for it: HyperY posts `hypery:payment-method` when a card is added;
  // closing the popup also ends the wait. Afterwards, re-read the wallet (if we can) and offer Continue.
  const openHosted = useCallback(
    async (url: string | null) => {
      if (!url) {
        setActionError('Billing isn’t available for this account right now.');
        return;
      }
      setBusy(true);
      setActionError(null);
      const popup = window.open(url, 'hypery-billing', 'width=480,height=760');
      if (!popup) {
        window.open(url, '_blank');
        setBusy(false);
        return;
      }
      const expectedOrigin = (() => {
        try {
          return new URL(gatewayUrl).origin;
        } catch {
          return window.location.origin;
        }
      })();
      const added = await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          window.removeEventListener('message', onMessage);
          clearInterval(poll);
          resolve(ok);
        };
        const onMessage = (event: MessageEvent) => {
          if (event.origin !== expectedOrigin) return;
          if (event?.data?.type === 'hypery:payment-method') finish(event.data.status === 'added');
        };
        window.addEventListener('message', onMessage);
        const poll = setInterval(() => {
          if (popup.closed) finish(false);
        }, 700);
      });
      const next = await loadWallet();
      // Without wallet access we can't check, so once they come back from HyperY, let them carry on.
      const ok = added || !next || next.paymentMethod?.exists || (next.balance?.current ?? 0) > 0;
      setBusy(false);
      if (ok) {
        setFunded(true);
        onFunded?.();
      }
    },
    [gatewayUrl, loadWallet, onFunded],
  );

  if (!error) return null;

  const openSettings = (url: string | null) => {
    if (url) window.open(url, '_blank');
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
        'hy:fixed hy:inset-0 hy:z-[var(--hy-z-modal,50)] hy:flex hy:items-center hy:justify-center hy:bg-overlay hy:p-4 hy:backdrop-blur-[2px] hy:animate-hy-overlay-in',
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
                  <button onClick={() => openSettings(hostedUrl('billing'))} className={primary}>
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
                  <button onClick={() => void openHosted(hostedUrl('addPaymentMethod'))} disabled={busy} className={primary}>
                    {busy && <Spinner />}
                    {busy ? 'Finish on HyperY…' : hasCard ? 'Update payment method' : 'Add a payment method'}
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
                // Prepaid + card on file → buy credits on HyperY.
                <button onClick={() => void openHosted(hostedUrl('topup'))} disabled={busy} className={primary}>
                  {busy && <Spinner />}
                  {busy ? 'Finish on HyperY…' : 'Add credits'}
                </button>
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
