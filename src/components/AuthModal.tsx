/**
 * AuthModal Component  
 * Modal dialog for authentication using shadcn Dialog
 */

'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog.js';
import { Mail } from 'lucide-react';
import { useSignInAttempt } from '../lib/sign-in-attempt.js';
import { cn } from '../lib/utils.js';
import {
  Divider,
  ErrorNote,
  GitHubIcon,
  GoogleIcon,
  ProviderButton,
  Spinner,
  brandStyle,
  buttonSizes,
  buttonVariants,
} from './ui/primitives.js';

/** Props of {@link AuthModal}. */
export interface AuthModalProps {
  /** Whether the dialog is open. */
  isOpen: boolean;
  /** Called when the dialog is dismissed. */
  onClose: () => void;
  /** Initial mode. Defaults to `signin`. */
  initialMode?: 'signin' | 'signup';
  /** Called once the user is actually signed in (after a popup login completes). */
  onSuccess?: () => void;
  /** Called if starting sign-in throws. */
  onError?: (error: string) => void;
  /** Show Google/GitHub buttons. Defaults to true. */
  showSocial?: boolean;
  /**
   * Show a "Continue with email" button that opens Hypery's hosted login page
   * (email/password is entered there, never in your app). Defaults to false.
   */
  showEmailPassword?: boolean;
  /** Logo, app name and accent color. */
  branding?: {
    logo?: string;
    appName?: string;
    primaryColor?: string;
  };
}

/**
 * Controlled sign-in / sign-up dialog. Every button runs the hosted OAuth flow
 * (Google/GitHub pass a provider hint that skips the hosted login page).
 *
 * @example
 * ```tsx
 * <AuthModal isOpen={open} onClose={() => setOpen(false)} branding={{ appName: 'Acme' }} />
 * ```
 */
export function AuthModal({
  isOpen,
  onClose,
  initialMode = 'signin',
  onSuccess,
  onError,
  showSocial = true,
  showEmailPassword = false,
  branding,
}: AuthModalProps) {

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const { start, pending: loadingProvider, error } = useSignInAttempt({ onSuccess, onError });
  const handleSocialSignIn = (provider: 'google' | 'github') => void start(provider);

  const title = mode === 'signin' ? 'Welcome back' : 'Create your account';
  const subtitle =
    mode === 'signin'
      ? `Sign in to ${branding?.appName || 'continue'}`
      : `Get started with ${branding?.appName || 'your account'}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="hy:max-w-[400px] hy:gap-0 hy:p-8" style={brandStyle(branding?.primaryColor)}>
        <DialogHeader className="hy:sm:text-center">
          {branding?.logo && (
            <img src={branding.logo} alt="Logo" className="hy:mx-auto hy:mb-3 hy:h-11 hy:w-auto" />
          )}
          <DialogTitle className="hy:text-center hy:text-xl">{title}</DialogTitle>
          <DialogDescription className="hy:text-center">{subtitle}</DialogDescription>
        </DialogHeader>

        <div className="hy:mt-6 hy:flex hy:flex-col hy:gap-4">
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

        <p className="hy:mt-6 hy:text-center hy:text-sm hy:text-muted-foreground">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className={buttonVariants.link}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}
