/**
 * Sign In Component
 * Similar to Clerk's <SignIn />
 */

'use client';

import React from 'react';
import { useHyperyAuth } from '../lib/context.js';
import { cn } from '../lib/utils.js';
import { ROOT, Spinner, buttonSizes, buttonVariants } from './ui/primitives.js';

export interface SignInProps {
  /** Button text */
  buttonText?: string;
  /** Custom className for styling */
  className?: string;
  /** Button style variant */
  variant?: 'primary' | 'secondary' | 'outline';
  /** Redirect path after sign in */
  redirectTo?: string;
  /** Show loading state */
  loading?: boolean;
}

/**
 * Pre-built sign-in button component
 * 
 * @example
 * ```tsx
 * <SignIn buttonText="Sign in with Hypery" />
 * ```
 */
export function SignIn({
  buttonText = 'Sign in with Hypery',
  className,
  variant = 'primary',
  redirectTo,
  loading,
}: SignInProps) {
  const { login, isLoading } = useHyperyAuth();

  const handleClick = () => {
    if (redirectTo) {
      sessionStorage.setItem('hypery_redirect_after_login', redirectTo);
    }
    login();
  };

  const isDisabled = isLoading || loading;

  // Default styles based on variant (replaced entirely by `className`).
  const defaultStyles = cn(buttonVariants[variant], buttonSizes.lg);

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={cn(ROOT, className || defaultStyles)}
      type="button"
    >
      {isDisabled ? <><Spinner />Loading…</> : buttonText}
    </button>
  );
}

