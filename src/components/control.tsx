/**
 * Control Components
 * Similar to Clerk's <SignedIn />, <SignedOut />, etc.
 */

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useHyperyAuth } from '../lib/context';

export interface SignedInProps {
  children: ReactNode;
  /** Fallback content to show while loading */
  fallback?: ReactNode;
}

/**
 * Only renders children when user is authenticated
 * 
 * @example
 * ```tsx
 * <SignedIn>
 *   <Dashboard />
 * </SignedIn>
 * ```
 */
export function SignedIn({ children, fallback }: SignedInProps) {
  const { isAuthenticated, isLoading } = useHyperyAuth();

  if (isLoading) {
    return fallback || null;
  }

  return isAuthenticated ? children : null;
}

export interface SignedOutProps {
  children: ReactNode;
  /** Fallback content to show while loading */
  fallback?: ReactNode;
}

/**
 * Only renders children when user is NOT authenticated
 * 
 * @example
 * ```tsx
 * <SignedOut>
 *   <SignIn />
 * </SignedOut>
 * ```
 */
export function SignedOut({ children, fallback }: SignedOutProps) {
  const { isAuthenticated, isLoading } = useHyperyAuth();

  if (isLoading) {
    return fallback || null;
  }

  return !isAuthenticated ? children : null;
}

/**
 * Pure decision used by `Protect` / `RedirectToSignIn`: start sign-in only once
 * auth has finished loading, the user is signed out, no logout is in progress,
 * and this component has not already triggered it.
 * @internal
 */
export function shouldStartSignIn(state: {
  isLoading: boolean;
  isAuthenticated: boolean;
  isLoggingOut?: boolean;
  alreadyStarted: boolean;
}): boolean {
  return !state.isLoading && !state.isAuthenticated && !state.isLoggingOut && !state.alreadyStarted;
}

/**
 * Run `action` once (per mount, StrictMode-safe via a ref) after render when
 * `shouldStartSignIn` says so. Re-arms once the user becomes authenticated.
 */
function useStartSignInOnce(enabled: boolean, action: () => void) {
  const { isAuthenticated, isLoading, isLoggingOut } = useHyperyAuth();
  const started = useRef(false);
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    if (isAuthenticated) {
      started.current = false;
      return;
    }
    if (!enabled) return;
    if (shouldStartSignIn({ isLoading, isAuthenticated, isLoggingOut, alreadyStarted: started.current })) {
      started.current = true;
      actionRef.current();
    }
  }, [enabled, isAuthenticated, isLoading, isLoggingOut]);
}

/**
 * Redirects to sign in when user is not authenticated. The redirect starts in
 * an effect (never during render), once, after auth has finished loading.
 *
 * @example
 * ```tsx
 * <RedirectToSignIn />
 * ```
 */
export function RedirectToSignIn() {
  const { login } = useHyperyAuth();
  useStartSignInOnce(true, () => {
    void login();
  });
  return null;
}

export interface ProtectProps {
  children: ReactNode;
  /** Fallback to show when not authenticated */
  fallback?: ReactNode;
  /** Custom redirect logic */
  onUnauthenticated?: () => void;
}

/**
 * Protects content. When signed out it renders `fallback` (or nothing); if
 * `onUnauthenticated` is set it is called, otherwise — when there is no
 * `fallback` — sign-in starts. Both run once in an effect, never during render.
 *
 * @example
 * ```tsx
 * <Protect fallback={<SignIn />}>
 *   <ProtectedContent />
 * </Protect>
 * ```
 */
export function Protect({
  children,
  fallback,
  onUnauthenticated,
}: ProtectProps) {
  const { isAuthenticated, isLoading, login, isLoggingOut } = useHyperyAuth();

  useStartSignInOnce(!!onUnauthenticated || !fallback, () => {
    if (onUnauthenticated) {
      onUnauthenticated();
    } else {
      void login();
    }
  });

  if (isLoading || isLoggingOut) {
    return fallback || null;
  }

  if (!isAuthenticated) {
    // Custom handler owns the signed-out UX; otherwise show the fallback.
    return onUnauthenticated ? null : fallback || null;
  }

  return children;
}
