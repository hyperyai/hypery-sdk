/**
 * Wallet hook for consumer apps.
 *
 * Reads the mode-aware wallet snapshot from the gateway (GET /api/wallet/state)
 * and exposes the two funding actions the embeddable widget needs:
 *   - addPaymentMethod()   → HyperY's hosted add-card page in a popup (no app scope needed)
 *   - addFunds(usd)        → 1-click off-session charge of the card on file. This one calls the billing API
 *                            directly and needs `billing:write`, which only HyperY's own apps hold; other apps
 *                            open `wallet.settingsUrls.topup` instead (as RestrictionModal does).
 *
 * Works in both billing modes; the widget chooses which action to show from
 * `wallet.mode` and `wallet.paymentMethod.exists`.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useHyperyAuth } from '../lib/context.js';
import { errorMessageFromBody, resolveGatewayUrl } from '../lib/gateway.js';

/**
 * How the team is billed for AI usage: `metered` (card billed for usage),
 * `prepaid` (credit balance), or `vag_passthrough` (usage billed through the
 * Vercel AI Gateway meter — no credit ledger).
 */
export type BillingMode = 'metered' | 'prepaid' | 'vag_passthrough';

/** A preset top-up tier. */
export interface WalletTier {
  name: string;
  usdAmount: number;
  credits: number;
  bonus: number;
  popular?: boolean;
}

/** Mode-aware wallet snapshot from `GET /api/wallet/state`. */
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
  settingsUrls: { billing: string; topup: string; addPaymentMethod: string; setup?: string };
}

/** Return value of {@link useWallet}. */
export interface UseWalletReturn {
  wallet: WalletState | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** 1-click: charge the card on file for `usd` dollars and credit the team. Needs `billing:write`. */
  addFunds: (usd: number) => Promise<void>;
  /** Open HyperY's hosted add-card page; resolves true once a card is added. */
  addPaymentMethod: () => Promise<boolean>;
}

/**
 * The team's AI-credit wallet with 1-click funding.
 *
 * @param opts.gatewayUrl Base URL override; defaults to the provider's `config.gatewayUrl`,
 * then `NEXT_PUBLIC_GATEWAY_URL`, else a relative URL.
 * @param opts.activeOrganizationId The HyperY team whose wallet this is (sent as `x-hypery-active-organization-id`);
 * omit for the person's own account.
 * @example
 * ```tsx
 * const { wallet, addFunds, addPaymentMethod } = useWallet({ gatewayUrl: 'https://hypery.ai' });
 * ```
 */
export function useWallet(opts: { gatewayUrl?: string; activeOrganizationId?: string | null } = {}): UseWalletReturn {
  const { isAuthenticated, getAccessToken, gatewayUrl: providerGatewayUrl } = useHyperyAuth();
  const gatewayUrl = resolveGatewayUrl(opts.gatewayUrl, providerGatewayUrl);
  const team = opts.activeOrganizationId ?? null;
  const headersFor = useCallback(
    (token: string, json = false): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(team ? { 'x-hypery-active-organization-id': team } : {}),
    }),
    [team],
  );

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
      const res = await fetch(`${gatewayUrl}/api/wallet/state`, { headers: headersFor(token) });
      if (!res.ok) throw new Error(`Wallet state request failed: ${res.status}`);
      const body = (await res.json()) as WalletState & { success: boolean };
      setWallet(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getAccessToken, gatewayUrl, headersFor]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addFunds = useCallback(
    async (usd: number) => {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${gatewayUrl}/api/wallet/topup`, {
        method: 'POST',
        headers: headersFor(token, true),
        body: JSON.stringify({ amount: usd }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(errorMessageFromBody(body, `Top-up failed: ${res.status}`));
      }
      await reload();
    },
    [getAccessToken, gatewayUrl, reload, headersFor]
  );

  const addPaymentMethod = useCallback(async (): Promise<boolean> => {
    // HyperY's hosted add-card page, signed in as the person: no billing scope needed by the app.
    let url = wallet?.settingsUrls?.addPaymentMethod ? `${gatewayUrl}${wallet.settingsUrls.addPaymentMethod}` : null;
    if (!url) {
      // No wallet to read the page from: start Checkout through the API (HyperY's own apps, with billing:write).
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${gatewayUrl}/api/payments/stripe/checkout-setup`, {
        method: 'POST',
        headers: headersFor(token, true),
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) {
        throw new Error(errorMessageFromBody(body, `Could not start checkout: ${res.status}`));
      }
      url = body.url as string;
    }

    const popup =
      typeof window !== 'undefined'
        ? window.open(url, 'hypery-add-card', 'width=480,height=760')
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
  }, [getAccessToken, gatewayUrl, reload, headersFor, wallet]);

  return { wallet, isLoading, error, reload, addFunds, addPaymentMethod };
}
