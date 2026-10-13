/**
 * Re-export hooks for convenience
 */

export { useHyperyAuth, useUser } from '../lib/context.js';

/**
 * Alias for useHyperyAuth to match Clerk's API
 * @example
 * ```tsx
 * const { isLoaded, isAuthenticated, user } = useAuth();
 * ```
 */
export { useHyperyAuth as useAuth } from '../lib/context.js';

// Workspace + membership hooks for the WorkspaceSwitcher and consumer apps.
export {
  useMemberships,
  useActiveWorkspace,
  setActiveWorkspace,
} from './useMemberships.js';
export type {
  MembershipEntry,
  MembershipTeam,
  MembershipWorkspace,
  MembershipsResponse,
  ActiveWorkspace,
} from './useMemberships.js';

// Mode-aware wallet hook (balance, 1-click add funds, add payment method).
export { useWallet } from './useWallet.js';
export type {
  BillingMode,
  WalletState,
  WalletTier,
  UseWalletReturn,
} from './useWallet.js';

// "Buy with Hypery" marketplace layer (Stripe Connect, consumer side).
export { useBuyerWallet } from './useBuyerWallet.js';
export type {
  BuyerPaymentMethod,
  AddCardOptions,
  UseBuyerWalletReturn,
} from './useBuyerWallet.js';
export { useMarketplace } from './useMarketplace.js';
export type {
  BuyInput,
  BuySuccess,
  BuyFailure,
  BuyResult,
  UseMarketplaceReturn,
} from './useMarketplace.js';

// Seamless auth + charge orchestrator (login → charge → add-card → retry) in
// popup or redirect mode. Powers <BuyButton>; use directly for custom buttons
// and for AI-credit top-ups (kind: 'topup').
export { useCheckout } from './useCheckout.js';
export type {
  CheckoutInput,
  SubscribeSessionResult,
  CheckoutStatus,
  CheckoutResult,
  UseCheckoutReturn,
} from './useCheckout.js';


// App subscription plans: the user's plan, remaining app credits, subscribe/cancel/resume.
export { useAppSubscription } from './useAppSubscription.js';
export type {
  AppPlan,
  AppPlanGrant,
  AppPlanPrice,
  PlanInterval,
  SwitchIntervalResult,
  AppSubscription,
  AppSubscriptionGrantBalance,
  UseAppSubscriptionReturn,
  UseAppSubscriptionOptions,
} from './useAppSubscription.js';
