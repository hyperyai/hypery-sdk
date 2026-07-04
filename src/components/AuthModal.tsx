/**
 * AuthModal Component  
 * Modal dialog for authentication using shadcn Dialog
 */

'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { useHyperyAuth } from '../lib/context';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
  onSuccess?: () => void;
  onError?: (error: string) => void;
  showSocial?: boolean;
  showEmailPassword?: boolean;
  branding?: {
    logo?: string;
    appName?: string;
    primaryColor?: string;
  };
}

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

  const { login } = useHyperyAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSocialSignIn = async (provider: 'google' | 'github') => {
    console.log('[AuthModal] Social button clicked:', provider);
    setLoadingProvider(provider);
    setError('');
    try {
      console.log('[AuthModal] Calling login()...');
      await login();
      console.log('[AuthModal] Login completed');
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error('[AuthModal] Login failed:', err);
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
        <DialogHeader>
          {branding?.logo && (
            <img src={branding.logo} alt="Logo" className="h-12 mx-auto mb-4" />
          )}
          <DialogTitle className="text-center text-2xl text-gray-900 dark:text-white">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-gray-600 dark:text-gray-400">
            {mode === 'signin' 
              ? `Sign in to ${branding?.appName || 'continue'}`
              : `Get started with ${branding?.appName || 'your account'}`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Social buttons */}
          {showSocial && (
            <div className="space-y-2">
              <button
                onClick={() => handleSocialSignIn('google')}
                disabled={!!loadingProvider}
                className="w-full bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white py-2 px-3 rounded flex items-center justify-center gap-2 text-sm font-medium transition-all disabled:opacity-50"
              >
                {loadingProvider === 'google' ? (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                className="w-full bg-gray-900 dark:bg-gray-800 hover:bg-gray-800 dark:hover:bg-gray-750 text-white py-2 px-3 rounded flex items-center justify-center gap-2 text-sm font-medium transition-all disabled:opacity-50"
              >
                {loadingProvider === 'github' ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                )}
                <span>Continue with GitHub</span>
              </button>
            </div>
          )}

          {/* Divider */}
          {showSocial && showEmailPassword && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">
                  Or continue with email
                </span>
              </div>
            </div>
          )}

          {/* Email/Password form */}
          {showEmailPassword && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {mode === 'signup' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="John Doe"
                  disabled={isLoading}
                />
              </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="you@example.com"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 rounded-md font-medium text-white transition-all"
                style={{ backgroundColor: primaryColor }}
              >
                {isLoading ? 'Processing...' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>
          )}

          {/* Toggle mode */}
          <div className="text-center text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
            </span>
            {' '}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="font-medium hover:underline"
              style={{ color: primaryColor }}
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
