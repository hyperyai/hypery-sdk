/**
 * Wallet hook for consumer apps.
 *
 * Reads the mode-aware wallet snapshot from the gateway (GET /api/wallet/state)
 * and exposes the two funding actions the embeddable widget needs:
 *   - addFunds(usd)        → 1-click off-session charge of the card on file
 *   - addPaymentMethod()   → Stripe-hosted Checkout (setup) in a popup
 *
 * Works in both billing modes; the widget chooses which action to show from
 * `wallet.mode` and `wallet.paymentMethod.exists`.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useHyperyAuth } from '../lib/context';

export type BillingMode = 'metered' | 'prepaid';

export interface WalletTier {
  name: string;
  usdAmount: number;
  credits: number;
  bonus: number;
  popular?: boolean;
}

export interface WalletState {
  mode: BillingMode;
  balance: {
    current: number;
    reserved: number;
    monthlySpent: number;
    monthlyLimit: number;
  };
  paymentMethod: { exists: boolean; last4?: string; brand?: string };
  autoTopUp: { enabled: boolean; threshold?: number; amount?: number };
  lowBalance: { isLow: boolean; threshold: number; current: number };
  topupTiers: WalletTier[];
  settingsUrls: { billing: string; topup: string; addPaymentMethod: string };
}

export interface UseWalletReturn {
  wallet: WalletState | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** 1-click: charge the card on file for `usd` dollars and credit the team. */
  addFunds: (usd: number) => Promise<void>;
  /** Open Stripe-hosted Checkout to add a card; resolves true once added. */
  addPaymentMethod: () => Promise<boolean>;
}

function resolveGatewayUrl(explicit?: string): string {
  return (
    explicit ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_GATEWAY_URL) ||
    ''
  );
}

export function useWallet(opts: { gatewayUrl?: string } = {}): UseWalletReturn {
  const { isAuthenticated, getAccessToken } = useHyperyAuth();
  const gatewayUrl = resolveGatewayUrl(opts.gatewayUrl);

  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setWallet(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setWallet(null);
        return;
      }
      const res = await fetch(`${gatewayUrl}/api/wallet/state`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Wallet state request failed: ${res.status}`);
      const body = (await res.json()) as WalletState & { success: boolean };
      setWallet(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getAccessToken, gatewayUrl]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addFunds = useCallback(
    async (usd: number) => {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${gatewayUrl}/api/wallet/topup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: usd }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || `Top-up failed: ${res.status}`);
      }
      await reload();
    },
    [getAccessToken, gatewayUrl, reload]
  );

  const addPaymentMethod = useCallback(async (): Promise<boolean> => {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`${gatewayUrl}/api/payments/stripe/checkout-setup`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.url) {
      throw new Error(body?.error || `Could not start checkout: ${res.status}`);
    }

    const popup =
      typeof window !== 'undefined'
        ? window.open(body.url, 'hypery-add-card', 'width=480,height=720')
        : null;

    // Resolve when the hosted-Checkout return page messages us, or when the
    // popup closes (fall back to a state reload to detect the new card).
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = async (added: boolean) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        clearInterval(poll);
        await reload();
        resolve(added);
      };
      // Only trust the completion message from the gateway's own origin.
      const expectedOrigin = gatewayUrl
        ? new URL(gatewayUrl).origin
        : typeof window !== 'undefined'
        ? window.location.origin
        : '';
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== expectedOrigin) return;
        if (event?.data?.type === 'hypery:payment-method') {
          void finish(event.data.status === 'added');
        }
      };
      window.addEventListener('message', onMessage);
      const poll = setInterval(() => {
        if (popup && popup.closed) void finish(false);
      }, 700);
    });
  }, [getAccessToken, gatewayUrl, reload]);

  return { wallet, isLoading, error, reload, addFunds, addPaymentMethod };
}
