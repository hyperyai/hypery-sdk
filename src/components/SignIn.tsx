/**
 * Sign In Component
 * Similar to Clerk's <SignIn />
 */

'use client';

import React from 'react';
import { useHyperyAuth } from '../lib/context';

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

  // Default styles based on variant
  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return 'bg-gray-600 hover:bg-gray-700 text-white';
      case 'outline':
        return 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50';
      default:
        return 'bg-blue-600 hover:bg-blue-700 text-white';
    }
  };

  const defaultStyles = `
    inline-flex items-center justify-center
    px-6 py-2.5
    rounded-lg
    font-medium
    transition-colors
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    ${getVariantStyles()}
  `.replace(/\s+/g, ' ').trim();

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={className || defaultStyles}
      type="button"
    >
      {isDisabled ? 'Loading...' : buttonText}
    </button>
  );
}

