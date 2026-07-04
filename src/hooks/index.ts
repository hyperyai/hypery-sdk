/**
 * Re-export hooks for convenience
 */

export { useHyperyAuth, useUser } from '../lib/context';

/**
 * Alias for useHyperyAuth to match Clerk's API
 * @example
 * ```tsx
 * const { isLoaded, isAuthenticated, user } = useAuth();
 * ```
 */
export { useHyperyAuth as useAuth } from '../lib/context';

// Workspace + membership hooks for the WorkspaceSwitcher and consumer apps.
export {
  useMemberships,
  useActiveWorkspace,
  setActiveWorkspace,
} from './useMemberships';
export type {
  MembershipEntry,
  MembershipTeam,
  MembershipWorkspace,
  MembershipsResponse,
  ActiveWorkspace,
} from './useMemberships';

// Mode-aware wallet hook (balance, 1-click add funds, add payment method).
export { useWallet } from './useWallet';
export type {
  BillingMode,
  WalletState,
  WalletTier,
  UseWalletReturn,
} from './useWallet';

// "Buy with Hypery" marketplace layer (Stripe Connect, consumer side).
export { useBuyerWallet } from './useBuyerWallet';
export type {
  BuyerPaymentMethod,
  AddCardOptions,
  UseBuyerWalletReturn,
} from './useBuyerWallet';
export { useMarketplace } from './useMarketplace';
export type {
  BuyInput,
  BuySuccess,
  BuyFailure,
  BuyResult,
  UseMarketplaceReturn,
} from './useMarketplace';

// Seamless auth + charge orchestrator (login → charge → add-card → retry) in
// popup or redirect mode. Powers <BuyButton>; use directly for custom buttons
// and for AI-credit top-ups (kind: 'topup').
export { useCheckout } from './useCheckout';
export type {
  CheckoutInput,
  CheckoutStatus,
  CheckoutResult,
  UseCheckoutReturn,
} from './useCheckout';

