import { ErrorData, ParsedError } from '../types';

const SPENDING_LIMIT = 'SPENDING_LIMIT_EXCEEDED';
const INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS';
const PAYMENT_METHOD_REQUIRED = 'PAYMENT_METHOD_REQUIRED';
const PAYMENT_DECLINED = 'PAYMENT_DECLINED';
const UNAUTHENTICATED = 'UNAUTHENTICATED';
const PERMISSION_DENIED = 'PERMISSION_DENIED';
const INSUFFICIENT_SCOPE = 'INSUFFICIENT_SCOPE';
const RATE_LIMITED = 'RATE_LIMITED';

/**
 * Extract the inner error object from any of the shapes the gateway / a caller
 * may hand us:
 *   - the raw server envelope: `{ error: { code, message, type, ... } }`
 *   - an already-unwrapped error object: `{ code, message, type, ... }`
 * Returns undefined if neither shape carries a `code`.
 */
function unwrap(error: any): ErrorData | undefined {
  if (error && typeof error === 'object') {
    if (error.error && typeof error.error === 'object' && 'code' in error.error) {
      return error.error as ErrorData;
    }
    if (typeof error.code === 'string') {
      return error as ErrorData;
    }
  }
  return undefined;
}

/** Pull an HTTP status off a Response-like / thrown-error object, if present. */
function statusOf(error: any): number | undefined {
  const s = error?.status ?? error?.statusCode ?? error?.response?.status;
  return typeof s === 'number' ? s : undefined;
}

/**
 * Parse an error (a parsed JSON body, a thrown error, or a Response-like object)
 * from the Hypery API into a normalized, classified shape. Tolerant of both the
 * `{ error: { code } }` envelope and an already-unwrapped object, and falls back
 * to the HTTP status when no recognized `code` is present.
 */
export function parseError(error: any): ParsedError {
  const errorData = unwrap(error);
  const status = statusOf(error);

  if (errorData) {
    const code = errorData.code;
    return {
      code,
      message: errorData.message,
      type: errorData.type,
      status,
      isSpendingLimit: code === SPENDING_LIMIT,
      isInsufficientCredits: code === INSUFFICIENT_CREDITS,
      isPaymentMethodRequired: code === PAYMENT_METHOD_REQUIRED,
      isPaymentDeclined: code === PAYMENT_DECLINED,
      isAuth: code === UNAUTHENTICATED || errorData.type === 'authentication_error',
      isPermissionDenied:
        code === PERMISSION_DENIED ||
        code === INSUFFICIENT_SCOPE ||
        errorData.type === 'permission_error' ||
        errorData.type === 'authorization_error',
      isRateLimit: code === RATE_LIMITED || errorData.type === 'rate_limit_error',
      data: errorData,
    };
  }

  // No recognized code — classify from HTTP status so a payment/auth modal can
  // still open for an endpoint that returns a non-canonical body.
  if (status === 402) {
    return statusFallback(INSUFFICIENT_CREDITS, 'Insufficient credits.', status, {
      isInsufficientCredits: true,
    });
  }
  if (status === 401) {
    return statusFallback(UNAUTHENTICATED, 'Authentication required.', status, { isAuth: true });
  }
  if (status === 403) {
    return statusFallback(PERMISSION_DENIED, 'You do not have permission to perform this action.', status, {
      isPermissionDenied: true,
    });
  }
  if (status === 429) {
    return statusFallback(RATE_LIMITED, 'Rate limit exceeded. Please retry shortly.', status, {
      isRateLimit: true,
    });
  }

  // Handle generic errors
  const message = error?.message || 'An unknown error occurred';
  return {
    code: 'UNKNOWN_ERROR',
    message,
    status,
    isSpendingLimit: false,
    isInsufficientCredits: false,
    isPaymentMethodRequired: false,
    isPaymentDeclined: false,
    isAuth: false,
    isPermissionDenied: false,
    isRateLimit: false,
    data: {
      code: 'UNKNOWN_ERROR',
      message,
    },
  };
}

function statusFallback(
  code: string,
  message: string,
  status: number,
  flags: Partial<
    Pick<
      ParsedError,
      | 'isSpendingLimit'
      | 'isInsufficientCredits'
      | 'isPaymentMethodRequired'
      | 'isPaymentDeclined'
      | 'isAuth'
      | 'isPermissionDenied'
      | 'isRateLimit'
    >
  >,
): ParsedError {
  return {
    code,
    message,
    status,
    isSpendingLimit: false,
    isInsufficientCredits: false,
    isPaymentMethodRequired: false,
    isPaymentDeclined: false,
    isAuth: false,
    isPermissionDenied: false,
    isRateLimit: false,
    ...flags,
    data: { code, message },
  };
}

/**
 * Check if an error is a spending limit error
 */
export function isSpendingLimitError(error: any): boolean {
  return parseError(error).isSpendingLimit;
}

/**
 * Check if an error is an insufficient credits error
 */
export function isInsufficientCreditsError(error: any): boolean {
  return parseError(error).isInsufficientCredits;
}

/**
 * Check if an error means the user must add a payment method (metered billing).
 */
export function isPaymentMethodRequiredError(error: any): boolean {
  return parseError(error).isPaymentMethodRequired;
}

/**
 * Check if an error means the user's card was declined (metered billing).
 */
export function isPaymentDeclinedError(error: any): boolean {
  return parseError(error).isPaymentDeclined;
}

/**
 * Check if an error is an authentication failure (re-auth / open the auth modal).
 */
export function isAuthError(error: any): boolean {
  return parseError(error).isAuth;
}

/**
 * Check if an error is a scope/permission denial (403) — NOT an auth failure,
 * so it should not trigger re-auth.
 */
export function isPermissionDeniedError(error: any): boolean {
  return parseError(error).isPermissionDenied;
}

/**
 * Check if an error is a rate-limit denial (429 / RATE_LIMITED).
 */
export function isRateLimitError(error: any): boolean {
  return parseError(error).isRateLimit;
}

/**
 * Any billing restriction the funds widget should surface a CTA for.
 */
export function isBillingRestriction(error: any): boolean {
  return (
    isSpendingLimitError(error) ||
    isInsufficientCreditsError(error) ||
    isPaymentMethodRequiredError(error) ||
    isPaymentDeclinedError(error)
  );
}

/**
 * Format time until reset
 */
export function formatTimeUntilReset(resetsAt?: string): string {
  if (!resetsAt) return '';

  const reset = new Date(resetsAt);
  const now = new Date();
  const diff = reset.getTime() - now.getTime();

  if (diff < 0) return 'soon';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  }
  return `in ${minutes}m`;
}
