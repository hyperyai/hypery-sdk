/**
 * Control Components
 * Similar to Clerk's <SignedIn />, <SignedOut />, etc.
 */

'use client';

import type { ReactNode } from 'react';
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
 * Redirects to sign in when user is not authenticated
 * 
 * @example
 * ```tsx
 * <RedirectToSignIn />
 * ```
 */
export function RedirectToSignIn() {
  const { login, isLoading, isAuthenticated } = useHyperyAuth();

  if (!isLoading && !isAuthenticated) {
    login();
  }

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
 * Protects content - redirects to sign in if not authenticated
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

  if (isLoading) {
    return fallback || null;
  }

  // Don't trigger login if we're in the middle of logging out
  if (!isAuthenticated && !isLoggingOut) {
    if (onUnauthenticated) {
      onUnauthenticated();
      return null;
    }

    if (fallback) {
      return fallback;
    }

    // Default: initiate login
    login();
    return null;
  }

  // If logging out, show fallback or nothing
  if (isLoggingOut) {
    return fallback || null;
  }

  return children;
}

