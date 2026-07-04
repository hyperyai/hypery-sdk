/**
 * Hypery Auth Types
 */

/**
 * How interactive auth / card-entry steps are presented.
 *   - `popup`    — a centered popup (seamless; stays on your page). PayPal/Firebase-style.
 *   - `redirect` — a full-page redirect that resumes the flow on return. Robust everywhere.
 *   - `auto`     — popup on desktop, redirect on mobile / when a popup is blocked.
 */
export type InteractionMode = 'auto' | 'popup' | 'redirect';
/** The concrete mode after resolving `auto` for the current environment. */
export type ResolvedMode = 'popup' | 'redirect';

/** Result of a popup-based login attempt. */
export interface PopupAuthResult {
  /** Authentication succeeded and the user is now signed in. */
  ok: boolean;
  /** The browser blocked the popup — caller should fall back to redirect. */
  blocked: boolean;
  /** The user closed the popup without completing auth. */
  cancelled: boolean;
}

/**
 * Custom branding shared by AuthButton / AuthModal / ModernAuthForm.
 */
export interface BrandingConfig {
  /** URL to logo image */
  logo?: string;
  /** Your app name */
  appName?: string;
  /** Hex color (e.g., '#8b5cf6') */
  primaryColor?: string;
}

export interface HyperyAuthConfig {
  /** OAuth Client ID */
  clientId: string;
  /** Redirect URI after auth */
  redirectUri: string;
  /** Hypery base URL */
  gatewayUrl: string;
  /** OAuth scopes to request */
  scopes?: string[];
  /** Storage type for tokens */
  storage?: 'localStorage' | 'sessionStorage' | 'memory';
  /**
   * How interactive auth / card-entry steps in the auth+charge flow are shown.
   * Defaults to `auto` (popup on desktop, redirect on mobile / blocked popups).
   * For popup mode, `redirectUri` must be same-origin as your app.
   */
  interactionMode?: InteractionMode;
  /**
   * Called when an {@link AuthContextValue.authenticatedFetch} request stays 401
   * after a single silent-refresh retry (server-revoked token / suspended app).
   * Use for custom re-auth handling; if omitted, `authRequired` is set so
   * `<HyperyModals>` can auto-open the auth modal.
   */
  onUnauthorized?: () => void;
  /**
   * Called when an {@link AuthContextValue.authenticatedFetch} request returns a
   * billing restriction (402/429). Receives the classified error; if omitted,
   * `restriction` is set so `<HyperyModals>` can auto-open the funds modal.
   */
  onRestricted?: (error: ParsedError) => void;
}

export interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isLoggingOut?: boolean;
}

export interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  /**
   * Log in via a centered popup (no full-page redirect). Resolves once the popup
   * completes: `ok` on success, `blocked` if the browser blocked the popup (fall
   * back to `login()`), `cancelled` if the user closed it. Used by the seamless
   * auth+charge flow (see `useCheckout`).
   */
  loginPopup: () => Promise<PopupAuthResult>;
  /** The interaction mode resolved for this environment (popup vs redirect). */
  interactionMode: ResolvedMode;
  /** The redirectUri this provider was configured with. */
  redirectUri: string;
  signUp?: () => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  /**
   * Get a valid access token, refreshing if the local expiry clock says so.
   * Pass `forceRefresh` to refresh even when the clock says valid (used by the
   * 401 retry path). Concurrent calls share ONE in-flight refresh (single-flight).
   */
  getAccessToken: (forceRefresh?: boolean) => Promise<string | null>;
  /** OAuth clientId this provider was configured with. */
  clientId: string;
  /** Gateway base URL this provider was configured with. */
  gatewayUrl: string;
  /**
   * fetch() that injects the bearer token and drives the turnkey modal UX:
   * 401 → one silent-refresh retry, then `authRequired` (+ `onUnauthorized`);
   * 402/429 → `restriction` is set (+ `onRestricted`). Always returns the
   * Response so the caller can still read the body.
   */
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Current billing restriction from the last authenticatedFetch, if any. */
  restriction: ParsedError | null;
  /** Clear the current restriction (e.g. after the funds modal closes). */
  clearRestriction: () => void;
  /** True when re-auth is required (401 survived a refresh retry). */
  authRequired: boolean;
  /** Clear the re-auth requirement (e.g. after the auth modal closes). */
  clearAuthRequired: () => void;
}

/**
 * Error response types from Hypery API
 */

export interface SpendingLimitErrorData {
  code: 'SPENDING_LIMIT_EXCEEDED';
  message: string;
  type: 'spending_limit_error';
  limitType: 'daily' | 'monthly' | 'total';
  limit: number;
  current: number;
  requested: number;
  resetsAt?: string;
}

export interface InsufficientCreditsErrorData {
  code: 'INSUFFICIENT_CREDITS';
  message: string;
  type: 'insufficient_credits_error';
  available: number;
  required: number;
}

export interface PaymentMethodRequiredErrorData {
  code: 'PAYMENT_METHOD_REQUIRED';
  message: string;
  type: 'payment_method_required_error';
}

export interface PaymentDeclinedErrorData {
  code: 'PAYMENT_DECLINED';
  message: string;
  type: 'payment_declined_error';
  reason?: string;
}

export interface AuthenticationErrorData {
  code: 'UNAUTHENTICATED';
  message: string;
  type: 'authentication_error';
}

export interface GenericErrorData {
  code: string;
  message: string;
  type?: string;
  [key: string]: any;
}

export type ErrorData =
  | SpendingLimitErrorData
  | InsufficientCreditsErrorData
  | PaymentMethodRequiredErrorData
  | PaymentDeclinedErrorData
  | AuthenticationErrorData
  | GenericErrorData;

export interface ErrorResponse {
  error: ErrorData;
}

/**
 * Parsed error information
 */
export interface ParsedError {
  code: string;
  message: string;
  type?: string;
  /** HTTP status, when the caller attaches it (used as a classification fallback). */
  status?: number;
  isSpendingLimit: boolean;
  isInsufficientCredits: boolean;
  isPaymentMethodRequired: boolean;
  isPaymentDeclined: boolean;
  /** True for an authentication failure (401 / UNAUTHENTICATED) — drive re-auth. */
  isAuth: boolean;
  /** True for a scope/permission denial (403 / PERMISSION_DENIED / INSUFFICIENT_SCOPE). */
  isPermissionDenied: boolean;
  /** True for a rate-limit denial (429 / RATE_LIMITED). */
  isRateLimit: boolean;
  data: ErrorData;
}

