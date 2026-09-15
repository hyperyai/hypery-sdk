/**
 * Shared sign-in flow for the embeddable auth forms (SignInForm, ModernAuthForm,
 * AuthModal). Sign-in is always Hypery's hosted OAuth flow: these helpers start
 * it (popup or redirect, per the provider's resolved `interactionMode`) and
 * report `onSuccess` only once the user is actually authenticated.
 * @internal
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHyperyAuth } from './context';
import type { LoginOptions } from '../types';

/** Which button started the attempt. */
export type SignInMethod = 'google' | 'github' | 'email';

/** Pure: fire `onSuccess` once, only after an attempt this component started. */
export function shouldFireAuthSuccess(state: {
  attempted: boolean;
  isAuthenticated: boolean;
  fired: boolean;
}): boolean {
  return state.attempted && state.isAuthenticated && !state.fired;
}

/** Pure: map a button to the authorize `provider` hint (email → hosted login page). */
export function loginOptionsFor(method: SignInMethod): LoginOptions | undefined {
  return method === 'google' || method === 'github' ? { provider: method } : undefined;
}

export function useSignInAttempt(callbacks: {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}) {
  const { isAuthenticated, interactionMode, login, loginPopup } = useHyperyAuth();
  const [pending, setPending] = useState<SignInMethod | null>(null);
  const [error, setError] = useState('');
  const attempted = useRef(false);
  const fired = useRef(false);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    if (shouldFireAuthSuccess({ attempted: attempted.current, isAuthenticated, fired: fired.current })) {
      fired.current = true;
      attempted.current = false;
      setPending(null);
      cbRef.current.onSuccess?.();
    }
  }, [isAuthenticated]);

  const start = useCallback(
    async (method: SignInMethod) => {
      attempted.current = true;
      fired.current = false;
      setPending(method);
      setError('');
      const options = loginOptionsFor(method);
      try {
        if (interactionMode === 'popup') {
          const result = await loginPopup(options);
          if (result.ok) return; // onSuccess fires from the effect once isAuthenticated flips
          if (result.blocked) {
            await login(options); // popup blocked → full-page redirect
            return;
          }
          // Closed/cancelled — not a success.
          attempted.current = false;
          setPending(null);
          return;
        }
        // Redirect: the page navigates to the hosted login; nothing else to do here.
        await login(options);
      } catch (err) {
        attempted.current = false;
        setPending(null);
        const message = err instanceof Error ? err.message : 'Sign in failed';
        setError(message);
        cbRef.current.onError?.(message);
      }
    },
    [interactionMode, login, loginPopup],
  );

  return { start, pending, error };
}
