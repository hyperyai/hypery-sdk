/**
 * NativeSignInDialog Component
 * How to sign in, in an app's iOS / Mac App Store build: Sign in with Apple natively
 * (App Review guideline 4 wants it finished inside the app), or the app's other sign-in
 * (the hosted page, without its Apple button). Handles two-factor accounts, a cancelled
 * Apple sheet, and an app without the Sign in with Apple capability (falls back to the
 * other sign-in).
 */

'use client';

import React, { useState } from 'react';
import type { AuthTokens } from '../types/index.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.js';
import { ErrorNote, Spinner, brandStyle, buttonSizes, buttonVariants } from './ui/primitives.js';
import { cn } from '../lib/utils.js';

/** Props of {@link NativeSignInDialog}. */
export interface NativeSignInDialogProps {
  /** Whether the dialog is open. */
  isOpen: boolean;
  /** Called when the dialog is dismissed (not while a sign-in is running). */
  onClose: () => void;
  /**
   * Runs native Sign in with Apple, normally `() => signInWithAppleNative({ ... })`.
   * Its errors are handled: `AppleSignInCancelled` returns to the choice,
   * `AppleSignInUnavailable` runs `onOtherMethods`, `AppleTwoFactorRequired` asks for the code.
   */
  signInWithApple: () => Promise<AuthTokens>;
  /** The app's other sign-in (e.g. the hosted page with `hideProviders: ['apple']`). Resolves once signed in. */
  onOtherMethods: () => Promise<unknown> | void;
  /** Called with the tokens after Sign in with Apple (store them, refresh the session). */
  onSignedIn: (tokens: AuthTokens) => Promise<void> | void;
  /** Sign-up wording instead of sign-in. */
  signup?: boolean;
  branding?: { appName?: string; primaryColor?: string };
}

type Complete = (code: string, type?: 'totp' | 'backup') => Promise<AuthTokens>;

function AppleLogo() {
  return (
    <svg width="14" height="17" viewBox="0 0 814 1000" aria-hidden="true" fill="currentColor">
      <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 61-88 123-156 123s-86-40-165-40c-77 0-104 41-166 41s-106-57-156-127C44 789 0 668 0 553c0-184 120-282 238-282 63 0 115 41 155 41 38 0 97-44 168-44 27 0 124 3 188 73zM554 157c30-35 51-84 51-133 0-7-1-14-2-19-48 2-105 32-140 72-27 31-53 80-53 130 0 8 1 15 2 18 3 1 9 1 14 1 43 0 97-29 128-69z" />
    </svg>
  );
}

/**
 * @example
 * ```tsx
 * <NativeSignInDialog
 *   isOpen={open}
 *   onClose={() => setOpen(false)}
 *   signInWithApple={() => signInWithAppleNative({ clientId, gatewayUrl, scopes, redirectUri, requestCredential })}
 *   onSignedIn={(tokens) => new TokenStorage('localStorage').saveTokens(tokens)}
 *   onOtherMethods={() => login({ hideProviders: ['apple'] })}
 *   branding={{ appName: 'Acme' }}
 * />
 * ```
 */
export function NativeSignInDialog({
  isOpen,
  onClose,
  signInWithApple,
  onOtherMethods,
  onSignedIn,
  signup = false,
  branding,
}: NativeSignInDialogProps) {
  const [busy, setBusy] = useState<'apple' | 'other' | 'code' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState<Complete | null>(null);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);

  const reset = () => {
    setError(null);
    setComplete(null);
    setCode('');
    setBackup(false);
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };
  const message = (e: unknown) => (e as Error)?.message || 'Sign-in didn’t go through. Try again.';

  const other = async () => {
    setBusy('other');
    setError(null);
    try {
      await onOtherMethods();
      reset();
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const apple = async () => {
    setBusy('apple');
    setError(null);
    let fallBack = false;
    try {
      await onSignedIn(await signInWithApple());
      reset();
      onClose();
    } catch (e) {
      const err = e as Error & { complete?: Complete };
      if (err?.name === 'AppleTwoFactorRequired' && err.complete) setComplete(() => err.complete as Complete);
      else if (err?.name === 'AppleSignInUnavailable') fallBack = true;
      else if (err?.name !== 'AppleSignInCancelled') setError(message(e));
    } finally {
      setBusy(null);
    }
    if (fallBack) await other();
  };

  const verify = async () => {
    if (!complete || !code.trim()) return;
    setBusy('code');
    setError(null);
    try {
      await onSignedIn(await complete(code.trim(), backup ? 'backup' : 'totp'));
      reset();
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const appName = branding?.appName;
  const title = complete
    ? 'Two-factor code'
    : signup
      ? `Create your ${appName ? `${appName} ` : ''}account`
      : `Sign in${appName ? ` to ${appName}` : ''}`;
  const subtitle = complete
    ? backup
      ? 'Enter one of the backup codes you saved when you turned on two-factor.'
      : 'Enter the 6-digit code from your authenticator app.'
    : 'Use your Apple Account, or another way to sign in.';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="hy:max-w-[400px] hy:gap-0 hy:p-8" style={brandStyle(branding?.primaryColor)}>
        <DialogHeader className="hy:sm:text-center">
          <DialogTitle className="hy:text-center hy:text-xl">{title}</DialogTitle>
          <DialogDescription className="hy:text-center">{subtitle}</DialogDescription>
        </DialogHeader>
        <div className="hy:mt-6 hy:flex hy:flex-col hy:gap-3">
          {error && <ErrorNote>{error}</ErrorNote>}
          {complete ? (
            <form
              className="hy:flex hy:flex-col hy:gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode={backup ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                maxLength={backup ? 32 : 6}
                placeholder={backup ? 'Backup code' : '123456'}
                aria-label={backup ? 'Backup code' : 'Two-factor code'}
                className="hy:h-10 hy:w-full hy:rounded-lg hy:bg-field hy:px-3 hy:text-center hy:font-mono hy:text-base hy:tracking-widest hy:text-foreground hy:outline-none hy:ring-1 hy:ring-inset hy:ring-border-strong hy:focus:ring-2 hy:focus:ring-primary"
              />
              <button
                type="submit"
                disabled={!!busy || !code.trim()}
                className={cn(buttonVariants.primary, buttonSizes.lg, 'hy:w-full')}
              >
                {busy === 'code' ? <Spinner /> : null}
                <span>Verify</span>
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  setBackup((b) => !b);
                  setCode('');
                  setError(null);
                }}
                className={cn(buttonVariants.ghost, buttonSizes.md, 'hy:w-full')}
              >
                {backup ? 'Use your authenticator app instead' : 'Use a backup code instead'}
              </button>
            </form>
          ) : (
            <>
              {/* Apple's button: black with the Apple logo (Human Interface Guidelines). */}
              <button
                type="button"
                onClick={() => void apple()}
                disabled={!!busy}
                className={cn(
                  buttonVariants.primary,
                  buttonSizes.xl,
                  'hy:w-full hy:bg-black hy:text-white hy:hover:bg-black/85',
                )}
              >
                {busy === 'apple' ? <Spinner /> : <AppleLogo />}
                <span>{signup ? 'Sign up with Apple' : 'Sign in with Apple'}</span>
              </button>
              <button
                type="button"
                onClick={() => void other()}
                disabled={!!busy}
                className={cn(buttonVariants.ghost, buttonSizes.lg, 'hy:w-full')}
              >
                {busy === 'other' ? <Spinner /> : null}
                <span>Other sign-in methods</span>
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
