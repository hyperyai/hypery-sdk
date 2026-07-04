'use client';

import React, { useCallback, useEffect, useState } from 'react';

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

type BillingMode = 'metered' | 'prepaid';

interface WalletState {
  mode: BillingMode;
  balance: { current: number; reserved: number; monthlySpent: number; monthlyLimit: number };
  paymentMethod: { exists: boolean; last4?: string; brand?: string };
  autoTopUp: { enabled: boolean; threshold?: number; amount?: number };
  lowBalance: { isLow: boolean; threshold: number; current: number };
  topupTiers: Array<{ name: string; usdAmount: number; credits: number; bonus: number; popular?: boolean }>;
  settingsUrls: { billing: string; topup: string; addPaymentMethod: string };
}

interface RestrictionModalProps {
  error: RestrictionError | null;
  /** OAuth clientId of the app making the requests. Preferred name. */
  clientId?: string;
  /**
   * @deprecated Use `clientId` instead. This prop is actually the OAuth clientId,
   * not the DB app id. Kept as a backward-compatible alias.
   */
  appId?: string;
  gatewayUrl: string;
  getAccessToken: () => Promise<string | null>;
  onClose: () => void;
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
          throw new Error(body?.error || `Top-up failed (${res.status})`);
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
        throw new Error(body?.error || `Could not start checkout (${res.status})`);
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
  const hasCard = !!wallet?.paymentMethod?.exists;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm ${overlayClassName}`}>
      <div className={`relative w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg shadow-2xl ${className}`}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-100 transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6">
          <h2 className="text-2xl font-bold text-center mb-4 text-white">{title}</h2>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              <span className="ml-3 text-gray-400">Loading your account…</span>
            </div>
          )}

          {!isLoading && (
            <>
              {/* Wallet summary */}
              {wallet && (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Available credits</span>
                    <span className="text-2xl font-bold text-white">{wallet.balance.current}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-500">
                      {mode === 'metered' ? 'Pay-as-you-go billing' : 'Prepaid balance'}
                    </span>
                    {wallet.paymentMethod.exists && (
                      <span className="text-xs text-gray-500">
                        {wallet.paymentMethod.brand} •••• {wallet.paymentMethod.last4}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {fetchError && (
                <p className="text-sm text-red-400 mb-4">⚠️ {fetchError}</p>
              )}
              {actionError && (
                <p className="text-sm text-red-400 mb-4">⚠️ {actionError}</p>
              )}

              {/* Context message */}
              {!funded && (
                <p className="text-sm text-gray-400 text-center mb-5">{error.message}</p>
              )}

              {/* Actions */}
              <div className="space-y-3">
                {funded ? (
                  <button
                    onClick={() => {
                      onRetry?.();
                      onClose();
                    }}
                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
                  >
                    Continue
                  </button>
                ) : isSpendingLimit ? (
                  <>
                    <button
                      onClick={() => openSettings(wallet?.settingsUrls.billing)}
                      className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white border border-gray-600 rounded-lg transition-colors"
                    >
                      Manage spending limits
                    </button>
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white border border-gray-600 rounded-lg transition-colors"
                      >
                        Try again
                      </button>
                    )}
                  </>
                ) : mode === 'metered' || !hasCard || isPaymentMethodRequired || isPaymentDeclined ? (
                  // Metered, or no card on file → capture/update a card first.
                  <>
                    <button
                      onClick={addPaymentMethod}
                      disabled={busy}
                      className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg transition-colors font-medium"
                    >
                      {busy ? 'Opening secure checkout…' : hasCard ? 'Update payment method' : 'Add a payment method'}
                    </button>
                    {mode === 'metered' && (
                      <p className="text-xs text-gray-500 text-center">
                        You’ll be billed automatically as you use the service.
                      </p>
                    )}
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        className="w-full px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
                      >
                        Try again
                      </button>
                    )}
                  </>
                ) : (
                  // Prepaid + card on file → 1-click add funds.
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {QUICK_AMOUNTS.map((usd) => (
                        <button
                          key={usd}
                          onClick={() => addFunds(usd)}
                          disabled={busy}
                          className="px-3 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg transition-colors font-medium"
                        >
                          ${usd}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => openSettings(wallet?.settingsUrls.topup)}
                      className="w-full px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
                    >
                      Other amount…
                    </button>
                  </>
                )}

                {!funded && (
                  <button
                    onClick={onClose}
                    className="w-full px-4 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
