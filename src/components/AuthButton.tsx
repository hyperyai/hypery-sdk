/**
 * AuthButton Component
 * Simple button that triggers authentication modal
 * Drop this anywhere in your app for instant auth
 */

'use client';

import React, { useState } from 'react';
import { AuthModal } from './AuthModal';

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
  /** Callback after successful auth */
  onSuccess?: () => void;
  /** Show social login options */
  showSocial?: boolean;
  /** Show email/password form */
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
  showEmailPassword = true,
  branding,
}: AuthButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-2.5 text-base',
    lg: 'px-8 py-3 text-lg',
  };

  const variantClasses = {
    primary: 'bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white shadow-md hover:shadow-lg',
    outline: 'border-2 border-purple-600 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30',
    ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
  };

  const handleClick = () => {
    console.log('AuthButton clicked! Opening modal...', { isOpen, mode });
    setIsOpen(true);
  };

  console.log('AuthButton render:', { isOpen, mode, variant, size });

  return (
    <>
      <button
        onClick={handleClick}
        type="button"
        className={`
          ${sizeClasses[size]}
          ${variantClasses[variant]}
          rounded-lg font-medium transition-all
          ${className}
        `}
      >
        {children}
      </button>

      <AuthModal
        isOpen={isOpen}
        onClose={() => {
          console.log('AuthModal closing...');
          setIsOpen(false);
        }}
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

