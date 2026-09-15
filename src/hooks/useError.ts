'use client';

import { useState, useCallback } from 'react';
import { parseError } from '../lib/parse-error';
import type { ParsedError } from '../types';

/** Return value of {@link useError}. */
export interface UseErrorReturn {
  /** The parsed error, or null. */
  error: ParsedError | null;
  /** Parse and store any error value (response body, thrown error); falsy clears. */
  setError: (error: any) => void;
  /** Clear the error. */
  clearError: () => void;
  /** `error !== null`. */
  hasError: boolean;
  isSpendingLimit: boolean;
  isInsufficientCredits: boolean;
  isPaymentMethodRequired: boolean;
  isPaymentDeclined: boolean;
  /** True when the error is an authentication failure (401) — open the auth modal / re-auth. */
  isAuth: boolean;
  /** True for any billing restriction the funds widget can resolve. */
  isBillingRestriction: boolean;
}

/**
 * Hook for managing error state with automatic parsing via `parseError`.
 *
 * @example
 * ```tsx
 * const { setError, isBillingRestriction } = useError();
 * if (!res.ok) setError({ ...(await res.json()), status: res.status });
 * ```
 */
export function useError(): UseErrorReturn {
  const [error, setErrorState] = useState<ParsedError | null>(null);

  const setError = useCallback((err: any) => {
    if (!err) {
      setErrorState(null);
      return;
    }
    setErrorState(parseError(err));
  }, []);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const isSpendingLimit = error?.isSpendingLimit || false;
  const isInsufficientCredits = error?.isInsufficientCredits || false;
  const isPaymentMethodRequired = error?.isPaymentMethodRequired || false;
  const isPaymentDeclined = error?.isPaymentDeclined || false;
  const isAuth = error?.isAuth || false;

  return {
    error,
    setError,
    clearError,
    hasError: error !== null,
    isSpendingLimit,
    isInsufficientCredits,
    isPaymentMethodRequired,
    isPaymentDeclined,
    isAuth,
    isBillingRestriction:
      isSpendingLimit || isInsufficientCredits || isPaymentMethodRequired || isPaymentDeclined,
  };
}

