/**
 * ModernAuthForm Component
 * Beautiful, embeddable authentication form
 * Inspired by modern SaaS login pages
 * Can be used standalone on login/signup pages
 */

'use client';

import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { useSignInAttempt } from '../lib/sign-in-attempt.js';
import { cn } from '../lib/utils.js';
import {
  AuthHeader,
  Divider,
  ErrorNote,
  GitHubIcon,
  GoogleIcon,
  ProviderButton,
  ROOT,
  Spinner,
  brandStyle,
  buttonSizes,
  buttonVariants,
} from './ui/primitives.js';

/** Props of {@link ModernAuthForm}. */
export interface ModernAuthFormProps {
  /** Auth mode: signin or signup */
  mode?: 'signin' | 'signup';
  /** Allow switching between signin/signup */
  allowModeSwitch?: boolean;
  /** Custom className */
  className?: string;
  /** Show card wrapper */
  showCard?: boolean;
  /** Show social OAuth buttons */
  showSocial?: boolean;
  /**
   * Show a "Continue with email" button that opens Hypery's hosted login page
   * (email/password is entered there, never in your app). Defaults to false.
   */
  showEmailPassword?: boolean;
  /** Called once the user is actually signed in (after a popup login completes). */
  onSuccess?: () => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Custom branding */
  branding?: {
    logo?: string;
    appName?: string;
    primaryColor?: string;
  };
}

/**
 * Modern authentication form with beautiful design
 * Perfect for dedicated login/signup pages
 * 
 * @example
 * ```tsx
 * // On login page
 * <ModernAuthForm 
 *   mode="signin"
 *   showCard
 *   allowModeSwitch
 *   onSuccess={() => router.push('/dashboard')}
 *   branding={{
 *     logo: '/logo.png',
 *     appName: 'My App',
 *     primaryColor: '#8b5cf6'
 *   }}
 * />
 * ```
 */
export function ModernAuthForm({
  mode: initialMode = 'signin',
  allowModeSwitch = true,
  className = '',
  showCard = true,
  showSocial = true,
  showEmailPassword = false,
  onSuccess,
  onError,
  branding,
}: ModernAuthFormProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const { start, pending: loadingProvider, error } = useSignInAttempt({ onSuccess, onError });
  const handleSocialSignIn = (provider: 'google' | 'github') => void start(provider);

  const formContent = (
    <div className="hy:flex hy:flex-col hy:gap-6">
      <AuthHeader
        logo={branding?.logo}
        size="lg"
        title={mode === 'signin' ? 'Welcome back' : 'Create your account'}
        subtitle={
          mode === 'signin'
            ? `Sign in to ${branding?.appName || 'continue'}`
            : `Get started with ${branding?.appName || 'your account'}`
        }
      />

      <div className="hy:flex hy:flex-col hy:gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {showSocial && (
          <div className="hy:grid hy:gap-2">
            <ProviderButton
              icon={<GoogleIcon />}
              label="Continue with Google"
              pending={loadingProvider === 'google'}
              disabled={!!loadingProvider}
              onClick={() => handleSocialSignIn('google')}
            />
            <ProviderButton
              icon={<GitHubIcon />}
              label="Continue with GitHub"
              pending={loadingProvider === 'github'}
              disabled={!!loadingProvider}
              onClick={() => handleSocialSignIn('github')}
            />
          </div>
        )}

        {showSocial && showEmailPassword && <Divider>Or continue with</Divider>}

        {/* Email: opens the hosted login page (credentials are never collected here) */}
        {showEmailPassword && (
          <button
            type="button"
            onClick={() => void start('email')}
            disabled={!!loadingProvider}
            className={cn(buttonVariants.primary, buttonSizes.lg, 'hy:w-full')}
          >
            {loadingProvider === 'email' ? <Spinner /> : <Mail aria-hidden className="hy:size-4" />}
            {loadingProvider === 'email' ? 'Connecting…' : 'Continue with email'}
          </button>
        )}
      </div>

      {allowModeSwitch && (
        <p className="hy:text-center hy:text-sm hy:text-muted-foreground">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className={buttonVariants.link}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      )}

      <p className="hy:border-t hy:border-border hy:pt-5 hy:text-center hy:text-xs hy:leading-relaxed hy:text-subtle-foreground">
        By continuing, you agree to our{' '}
        <a href="/terms" className={buttonVariants.link}>
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="/privacy" className={buttonVariants.link}>
          Privacy Policy
        </a>
      </p>
    </div>
  );

  const style = brandStyle(branding?.primaryColor);

  if (!showCard) {
    return (
      <div className={cn(ROOT, 'hy:text-foreground', className)} style={style}>
        {formContent}
      </div>
    );
  }

  return (
    <div
      className={cn(
        ROOT,
        'hy:w-full hy:max-w-[400px] hy:rounded-2xl hy:bg-card hy:p-8 hy:text-card-foreground hy:shadow-card hy:sm:p-10',
        className,
      )}
      style={style}
    >
      {formContent}
    </div>
  );
}
