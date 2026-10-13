/**
 * SignInForm Component
 * Embedded sign-in card: Google/GitHub buttons and an optional "Continue with
 * email" button. All of them run Hypery's hosted OAuth flow (popup or redirect).
 */

'use client';

import React from 'react';
import { useSignInAttempt } from '../lib/sign-in-attempt.js';
import { useHyperyAuth } from '../lib/context.js';
import { Mail } from 'lucide-react';
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
  buttonSizes,
  buttonVariants,
} from './ui/primitives.js';

export interface SignInFormProps {
  /** Custom CSS class */
  className?: string;
  /** Show card styling */
  showCard?: boolean;
  /** Show title and description */
  showTitle?: boolean;
  /** Custom title */
  title?: string;
  /** Custom description */
  description?: string;
  /** Show social OAuth buttons (GitHub, Google) */
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
}

/**
 * Embedded sign-in form component
 * Provides email/password and OAuth authentication
 * 
 * @example
 * ```tsx
 * <SignInForm 
 *   showCard
 *   showTitle
 *   showSocial
 *   onSuccess={() => console.log('Signed in!')}
 * />
 * ```
 */
export function SignInForm({
  className,
  showCard = true,
  showTitle = true,
  title = 'Sign in to continue',
  description = 'Choose your preferred sign-in method',
  showSocial = true,
  showEmailPassword = false,
  onSuccess,
  onError,
}: SignInFormProps) {
  const { login, signUp } = useHyperyAuth();
  const { start, pending: loadingProvider, error } = useSignInAttempt({ onSuccess, onError });
  const handleSocialSignIn = (provider: 'google' | 'github') => void start(provider);

  return (
    <div
      className={cn(
        ROOT,
        'hy:flex hy:flex-col hy:gap-6 hy:text-foreground',
        showCard && 'hy:mx-auto hy:w-full hy:max-w-[400px] hy:rounded-2xl hy:bg-card hy:p-8 hy:text-card-foreground hy:shadow-card',
        className,
      )}
    >
      {showTitle && <AuthHeader title={title} subtitle={description} />}

      <div className="hy:flex hy:flex-col hy:gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        {showSocial && (
          <div className="hy:grid hy:gap-2">
            <ProviderButton
              icon={<GitHubIcon />}
              label="Continue with GitHub"
              pending={loadingProvider === 'github'}
              disabled={!!loadingProvider}
              onClick={() => handleSocialSignIn('github')}
            />
            <ProviderButton
              icon={<GoogleIcon />}
              label="Continue with Google"
              pending={loadingProvider === 'google'}
              disabled={!!loadingProvider}
              onClick={() => handleSocialSignIn('google')}
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

      <p className="hy:text-center hy:text-sm hy:text-muted-foreground">
        Don't have an account?{' '}
        <button
          onClick={() => {
            // Use signUp if available (forces account selection), otherwise fallback to login
            if (signUp) {
              signUp();
            } else {
              login();
            }
          }}
          className={buttonVariants.link}
          type="button"
        >
          Sign up
        </button>
      </p>
    </div>
  );
}
