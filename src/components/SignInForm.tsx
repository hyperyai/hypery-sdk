/**
 * SignInForm Component
 * Embedded login form with email/password and social OAuth
 * Authenticates directly with the Hypery without extra redirects
 */

'use client';

import React, { useState } from 'react';
import { useHyperyAuth } from '../lib/context';

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
  /** Show email/password form */
  showEmailPassword?: boolean;
  /** Callback after successful sign in */
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
  showEmailPassword = true,
  onSuccess,
  onError,
}: SignInFormProps) {
  const { login, signUp } = useHyperyAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Handle OAuth sign-in with social providers
  // This directly initiates the OAuth flow with the gateway
  const handleSocialSignIn = (provider: 'google' | 'github') => {
    setLoadingProvider(provider);
    setError('');
    try {
      // The login() function will redirect to the gateway's OAuth flow
      // If the user is already authenticated with the provider, 
      // they'll only need to authorize the OAuth app
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

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Validate
    if (!email || !password) {
      setError('Please enter both email and password');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsLoading(false);
      return;
    }

    // For now, redirect to OAuth flow
    // In the future, this could call a direct auth API
    setError('Direct email login not yet supported. Please use the sign-in button.');
    setIsLoading(false);
  };

  const containerClasses = showCard
    ? 'bg-white rounded-lg shadow-md p-8 max-w-md mx-auto'
    : '';

  return (
    <div className={`${containerClasses} ${className || ''}`}>
      {showTitle && (
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-2">{title}</h2>
          <p className="text-gray-600">{description}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Social OAuth Buttons */}
      {showSocial && (
        <div className="space-y-2 mb-6">
          {/* GitHub Button */}
          <button
            onClick={() => handleSocialSignIn('github')}
            disabled={!!loadingProvider}
            className="w-full bg-[#24292F] hover:bg-[#1B1F23] text-white py-2 px-3 rounded flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-50"
            type="button"
          >
            {loadingProvider === 'github' ? (
              <span>Connecting...</span>
            ) : (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                <span>Continue with GitHub</span>
              </>
            )}
          </button>

          {/* Google Button */}
          <button
            onClick={() => handleSocialSignIn('google')}
            disabled={!!loadingProvider}
            className="w-full bg-white hover:bg-gray-50 text-gray-700 py-2 px-3 rounded flex items-center justify-center gap-2 text-sm font-medium border border-gray-300 transition-colors disabled:opacity-50"
            type="button"
          >
            {loadingProvider === 'google' ? (
              <span>Connecting...</span>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Divider */}
      {showSocial && showEmailPassword && (
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-gray-500">
              Or continue with email
            </span>
          </div>
        </div>
      )}

      {/* Email/Password Form */}
      {showEmailPassword && (
        <form onSubmit={handleEmailSignIn} className="space-y-4 mb-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading || !!loadingProvider}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-[15px]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading || !!loadingProvider}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-[15px]"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !!loadingProvider}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[15px]"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      )}

      <div className="text-center">
        <p className="text-sm text-gray-600">
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
            className="text-blue-600 hover:text-blue-700 font-medium"
            type="button"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}

