/**
 * SignUp Component
 * Button to initiate the sign-up flow via OAuth
 */

'use client';

import React from 'react';
import { useHyperyAuth } from '../lib/context.js';
import { cn } from '../lib/utils.js';
import { ROOT, buttonSizes, buttonVariants } from './ui/primitives.js';

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

  // Default styles based on variant (replaced entirely by `className`).
  const defaultStyles = cn(buttonVariants[variant], buttonSizes.lg);

  return (
    <button
      onClick={handleSignUp}
      className={cn(ROOT, className || defaultStyles)}
      type="button"
    >
      {buttonText}
    </button>
  );
}

