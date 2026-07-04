/**
 * SignUp Component
 * Button to initiate the sign-up flow via OAuth
 */

'use client';

import React from 'react';
import { useHyperyAuth } from '../lib/context';

export interface SignUpProps {
  /** Custom button text */
  buttonText?: string;
  /** Custom CSS class */
  className?: string;
  /** Button style variant */
  variant?: 'primary' | 'secondary' | 'outline';
  /** Callback after sign up initiated */
  onSignUpStart?: () => void;
  /** Custom redirect URL after sign up */
  redirectUrl?: string;
}

/**
 * Sign up button component
 * 
 * @example
 * ```tsx
 * <SignUp buttonText="Get Started" />
 * ```
 */
export function SignUp({
  buttonText = 'Sign up',
  className,
  variant = 'primary',
  onSignUpStart,
  redirectUrl,
}: SignUpProps) {
  const { signUp, login } = useHyperyAuth();

  const handleSignUp = () => {
    if (onSignUpStart) {
      onSignUpStart();
    }
    // Use signUp if available (forces account selection), otherwise fallback to login
    if (signUp) {
      signUp();
    } else {
      login();
    }
  };

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
      onClick={handleSignUp}
      className={className || defaultStyles}
      type="button"
    >
      {buttonText}
    </button>
  );
}

