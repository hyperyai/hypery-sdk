/**
 * AuthButton Component
 * Simple button that triggers authentication modal
 * Drop this anywhere in your app for instant auth
 */

'use client';

import React, { useState } from 'react';
import { AuthModal } from './AuthModal.js';
import { cn } from '../lib/utils.js';
import { ROOT, brandStyle, buttonSizes, buttonVariants } from './ui/primitives.js';

/** Props of {@link AuthButton}. */
export interface AuthButtonProps {
  /** Button text */
  children?: React.ReactNode;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Custom className */
  className?: string;
  /** Initial auth mode */
  mode?: 'signin' | 'signup';
  /** Called once the user is actually signed in. */
  onSuccess?: () => void;
  /** Show social login options */
  showSocial?: boolean;
  /** Show a "Continue with email" button (opens the hosted login page). Defaults to false. */
  showEmailPassword?: boolean;
  /** Custom branding for modal */
  branding?: {
    logo?: string;
    appName?: string;
    primaryColor?: string;
  };
}

/**
 * Button that opens authentication modal
 * Perfect for navbar, landing pages, or anywhere you need auth
 * 
 * @example
 * ```tsx
 * // Simple usage
 * <AuthButton>Sign In</AuthButton>
 * 
 * // With customization
 * <AuthButton 
 *   variant="primary"
 *   mode="signup"
 *   onSuccess={() => router.push('/dashboard')}
 *   branding={{ appName: 'My App', primaryColor: '#8b5cf6' }}
 * >
 *   Get Started
 * </AuthButton>
 * ```
 */
export function AuthButton({
  children = 'Sign In',
  variant = 'primary',
  size = 'md',
  className = '',
  mode = 'signin',
  onSuccess,
  showSocial = true,
  showEmailPassword = false,
  branding,
}: AuthButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sizeClasses = {
    sm: buttonSizes.sm,
    md: buttonSizes.lg,
    lg: buttonSizes.xl,
  };

  const variantClasses = {
    primary: buttonVariants.primary,
    secondary: buttonVariants.secondary,
    outline: buttonVariants.outline,
    ghost: buttonVariants.ghost,
  };

  const handleClick = () => {
    setIsOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        type="button"
        className={cn(ROOT, variantClasses[variant], sizeClasses[size], className)}
        style={brandStyle(branding?.primaryColor)}
      >
        {children}
      </button>

      <AuthModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialMode={mode}
        onSuccess={() => {
          setIsOpen(false);
          onSuccess?.();
        }}
        showSocial={showSocial}
        showEmailPassword={showEmailPassword}
        branding={branding}
      />
    </>
  );
}

