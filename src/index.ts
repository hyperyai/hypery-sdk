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
export { HyperyProvider, useHyperyAuth, useUser } from './lib/context.js';
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
} from './hooks/index.js';
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
} from './hooks/index.js';

// Auth Components
export { SignIn } from './components/SignIn.js';
export { SignUp } from './components/SignUp.js';
export { SignInForm } from './components/SignInForm.js';
export { UserButton } from './components/UserButton.js';
export { UserProfile } from './components/UserProfile.js';
export { SignedIn, SignedOut, RedirectToSignIn, Protect } from './components/control.js';
export { AuthModal } from './components/AuthModal.js';
export type { AuthModalProps } from './components/AuthModal.js';
export { AuthButton } from './components/AuthButton.js';
export type { AuthButtonProps } from './components/AuthButton.js';
export { ModernAuthForm } from './components/ModernAuthForm.js';
export type { ModernAuthFormProps } from './components/ModernAuthForm.js';
export { WorkspaceSwitcher } from './components/WorkspaceSwitcher.js';
export type { WorkspaceSwitcherProps } from './components/WorkspaceSwitcher.js';

// "Buy with Hypery" marketplace checkout button.
export { BuyButton } from './components/BuyButton.js';
export type { BuyButtonProps } from './components/BuyButton.js';

// Subscribe to an app's plan via Hypery.
export { planPriceCents } from './lib/checkout.js';
export { SubscribeButton } from './components/SubscribeButton.js';
export type { SubscribeButtonProps } from './components/SubscribeButton.js';

// Error Components
export { RestrictionModal } from './components/RestrictionModal.js';
export type { RestrictionError } from './components/RestrictionModal.js';

// Turnkey modal host — mount once for automatic billing/auth modals driven by
// authenticatedFetch (issue #42).
export { HyperyModals } from './components/HyperyModals.js';
export type { HyperyModalsProps } from './components/HyperyModals.js';

export { SpendingLimitAlert } from './components/SpendingLimitAlert.js';
export type { SpendingLimitAlertProps } from './components/SpendingLimitAlert.js';

export { InsufficientCreditsAlert } from './components/InsufficientCreditsAlert.js';
export type { InsufficientCreditsAlertProps } from './components/InsufficientCreditsAlert.js';

export { ErrorBoundary } from './components/ErrorBoundary.js';
export type { ErrorBoundaryProps } from './components/ErrorBoundary.js';

// Error Hook
export { useError } from './hooks/useError.js';
export type { UseErrorReturn } from './hooks/useError.js';

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
} from './types/index.js';

// Utilities (for advanced usage)
export {
  resolvePostLogoutRedirect,
  DEFAULT_POST_LOGOUT_REDIRECT,
} from './lib/logout-redirect.js';
export { TokenStorage } from './lib/storage.js';
export {
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getUserInfo,
} from './lib/oauth.js';

// Incremental OAuth scopes
export {
  InsufficientScopeError,
  isInsufficientScopeError,
  parseInsufficientScope,
  throwIfInsufficientScope,
  requestScopes,
  withScope,
  mergeScopes,
  parseScopeString,
} from './lib/scopes.js';
export type {
  OpenAuthUrl,
  ScopeRequestMode,
  RequestScopesOptions,
  RequestScopesResult,
} from './lib/scopes.js';

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
} from './lib/parse-error.js';

// Streaming (SSE) error classification — surface a terminal mid-stream error in
// the same classified shape as a non-streaming failure (issue #44).
export { parseSSEError, parseSSEFrame, consumeSSEStream } from './lib/parse-stream.js';
export type { SSEEvent, SSEStreamHandlers } from './lib/parse-stream.js';

