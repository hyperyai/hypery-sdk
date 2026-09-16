/**
 * @hyperyai/sdk
 * Drop-in authentication and error handling library for Hypery apps
 * 
 * @example
 * ```tsx
 * import { HyperyProvider, useUser, SignedIn, SignedOut } from '@hyperyai/sdk';
 * 
 * <HyperyProvider config={{ ... }}>
 *   <SignedIn>
 *     <App />
 *   </SignedIn>
 *   <SignedOut>
 *     <SignIn />
 *   </SignedOut>
 * </HyperyProvider>
 * ```
 */

// Provider & Hooks
export { HyperyProvider, useHyperyAuth, useUser } from './lib/context';
export {
  useAuth,
  useMemberships,
  useActiveWorkspace,
  setActiveWorkspace,
  useWallet,
  useBuyerWallet,
  useMarketplace,
  useCheckout,
  useAppSubscription,
} from './hooks';
export type {
  MembershipEntry,
  MembershipTeam,
  MembershipWorkspace,
  MembershipsResponse,
  ActiveWorkspace,
  BillingMode,
  WalletState,
  WalletTier,
  UseWalletReturn,
  BuyerPaymentMethod,
  AddCardOptions,
  UseBuyerWalletReturn,
  BuyInput,
  BuySuccess,
  BuyFailure,
  BuyResult,
  UseMarketplaceReturn,
  CheckoutInput,
  CheckoutStatus,
  CheckoutResult,
  UseCheckoutReturn,
  SubscribeSessionResult,
  AppPlan,
  AppPlanGrant,
  AppPlanPrice,
  PlanInterval,
  SwitchIntervalResult,
  AppSubscription,
  AppSubscriptionGrantBalance,
  UseAppSubscriptionReturn,
  UseAppSubscriptionOptions,
} from './hooks';

// Auth Components
export { SignIn } from './components/SignIn';
export { SignUp } from './components/SignUp';
export { SignInForm } from './components/SignInForm';
export { UserButton } from './components/UserButton';
export { UserProfile } from './components/UserProfile';
export { SignedIn, SignedOut, RedirectToSignIn, Protect } from './components/control';
export { AuthModal } from './components/AuthModal';
export type { AuthModalProps } from './components/AuthModal';
export { AuthButton } from './components/AuthButton';
export type { AuthButtonProps } from './components/AuthButton';
export { ModernAuthForm } from './components/ModernAuthForm';
export type { ModernAuthFormProps } from './components/ModernAuthForm';
export { WorkspaceSwitcher } from './components/WorkspaceSwitcher';
export type { WorkspaceSwitcherProps } from './components/WorkspaceSwitcher';

// "Buy with Hypery" marketplace checkout button.
export { BuyButton } from './components/BuyButton';
export type { BuyButtonProps } from './components/BuyButton';

// Subscribe to an app's plan via Hypery.
export { planPriceCents } from './lib/checkout';
export { SubscribeButton } from './components/SubscribeButton';
export type { SubscribeButtonProps } from './components/SubscribeButton';

// Error Components
export { RestrictionModal } from './components/RestrictionModal';
export type { RestrictionError } from './components/RestrictionModal';

// Turnkey modal host — mount once for automatic billing/auth modals driven by
// authenticatedFetch (issue #42).
export { HyperyModals } from './components/HyperyModals';
export type { HyperyModalsProps } from './components/HyperyModals';

export { SpendingLimitAlert } from './components/SpendingLimitAlert';
export type { SpendingLimitAlertProps } from './components/SpendingLimitAlert';

export { InsufficientCreditsAlert } from './components/InsufficientCreditsAlert';
export type { InsufficientCreditsAlertProps } from './components/InsufficientCreditsAlert';

export { ErrorBoundary } from './components/ErrorBoundary';
export type { ErrorBoundaryProps } from './components/ErrorBoundary';

// Error Hook
export { useError } from './hooks/useError';
export type { UseErrorReturn } from './hooks/useError';

// Types
export type {
  BrandingConfig,
  HyperyAuthConfig,
  InteractionMode,
  ResolvedMode,
  PopupAuthResult,
  LoginOptions,
  PostLogoutRedirect,
  User,
  AuthTokens,
  AuthState,
  AuthContextValue,
  SpendingLimitErrorData,
  InsufficientCreditsErrorData,
  PaymentMethodRequiredErrorData,
  PaymentDeclinedErrorData,
  AuthenticationErrorData,
  GenericErrorData,
  ErrorData,
  ErrorResponse,
  ParsedError,
} from './types';

// Utilities (for advanced usage)
export {
  resolvePostLogoutRedirect,
  DEFAULT_POST_LOGOUT_REDIRECT,
} from './lib/logout-redirect';
export { TokenStorage } from './lib/storage';
export {
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getUserInfo,
} from './lib/oauth';

// Error Utilities
export {
  parseError,
  isSpendingLimitError,
  isInsufficientCreditsError,
  isPaymentMethodRequiredError,
  isPaymentDeclinedError,
  isAuthError,
  isPermissionDeniedError,
  isRateLimitError,
  isBillingRestriction,
  formatTimeUntilReset,
} from './lib/parse-error';

// Streaming (SSE) error classification — surface a terminal mid-stream error in
// the same classified shape as a non-streaming failure (issue #44).
export { parseSSEError, parseSSEFrame, consumeSSEStream } from './lib/parse-stream';
export type { SSEEvent, SSEStreamHandlers } from './lib/parse-stream';

