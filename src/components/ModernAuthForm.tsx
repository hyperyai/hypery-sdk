/**
 * ModernAuthForm Component
 * Beautiful, embeddable authentication form
 * Inspired by modern SaaS login pages
 * Can be used standalone on login/signup pages
 */

'use client';

import React, { useState } from 'react';
import { useHyperyAuth } from '../lib/context';

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
  /** Show email/password form */
  showEmailPassword?: boolean;
  /** Callback after successful auth */
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
  showEmailPassword = true,
  onSuccess,
  onError,
  branding,
}: ModernAuthFormProps) {
  const { login } = useHyperyAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSocialSignIn = (provider: 'google' | 'github') => {
    setLoadingProvider(provider);
    setError('');
    try {
      login();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `${provider} sign in failed`;
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
      setLoadingProvider(null);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!email || !password) {
      setError('Please fill in all fields');
      setIsLoading(false);
      return;
    }

    if (mode === 'signup' && !name) {
      setError('Please enter your name');
      setIsLoading(false);
      return;
    }

    setError('Direct email authentication coming soon. Please use social sign-in.');
    setIsLoading(false);
  };

  const primaryColor = branding?.primaryColor || '#8b5cf6';

  const formContent = (
    <div className={!showCard ? className : ''}>
      {/* Header */}
      <div className="text-center mb-8">
        {branding?.logo && (
          <img src={branding.logo} alt="Logo" className="h-12 mx-auto mb-6" />
        )}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {mode === 'signin' 
            ? `Sign in to ${branding?.appName || 'continue'}`
            : `Get started with ${branding?.appName || 'your account'}`
          }
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm flex items-start gap-3">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Social buttons */}
      {showSocial && (
        <div className="space-y-3 mb-6">
          <button
            onClick={() => handleSocialSignIn('google')}
            disabled={!!loadingProvider}
            className="w-full bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 font-medium transition-all disabled:opacity-50 shadow-sm hover:shadow-md"
          >
            {loadingProvider === 'google' ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          <button
            onClick={() => handleSocialSignIn('github')}
            disabled={!!loadingProvider}
            className="w-full bg-gray-900 dark:bg-gray-800 hover:bg-gray-800 dark:hover:bg-gray-750 text-white py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 font-medium transition-all disabled:opacity-50 shadow-sm hover:shadow-md"
          >
            {loadingProvider === 'github' ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            )}
            <span>Continue with GitHub</span>
          </button>
        </div>
      )}

      {/* Divider */}
      {showSocial && showEmailPassword && (
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 font-medium">
              Or continue with email
            </span>
          </div>
        </div>
      )}

      {/* Email/Password form */}
      {showEmailPassword && (
        <form onSubmit={handleEmailSubmit} className="space-y-5">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-offset-2 focus:outline-none transition-all"
                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                placeholder="John Doe"
                disabled={isLoading}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-offset-2 focus:outline-none transition-all"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              placeholder="you@example.com"
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              {mode === 'signin' && (
                <a 
                  href="/forgot-password" 
                  className="text-sm font-medium hover:underline"
                  style={{ color: primaryColor }}
                >
                  Forgot?
                </a>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-offset-2 focus:outline-none transition-all"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              placeholder="••••••••"
              disabled={isLoading}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: primaryColor }}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
              </span>
            ) : (
              mode === 'signin' ? 'Sign in' : 'Create account'
            )}
          </button>
        </form>
      )}

      {/* Mode switcher */}
      {allowModeSwitch && (
        <div className="mt-6 text-center text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          {' '}
          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="font-semibold hover:underline"
            style={{ color: primaryColor }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-500 dark:text-gray-500">
        By continuing, you agree to our{' '}
        <a href="/terms" className="hover:underline font-medium" style={{ color: primaryColor }}>
          Terms of Service
        </a>
        {' '}and{' '}
        <a href="/privacy" className="hover:underline font-medium" style={{ color: primaryColor }}>
          Privacy Policy
        </a>
      </div>
    </div>
  );

  if (!showCard) {
    return <div className={className}>{formContent}</div>;
  }

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-10 max-w-md w-full ${className}`}>
      {formContent}
    </div>
  );
}


