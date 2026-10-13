/**
 * @hyperyai/sdk/testing — render SDK components and hooks without a gateway.
 *
 * `HyperyTestProvider` supplies the same context `HyperyProvider` does, but with
 * a static value: signed in as `user`, or signed out when `user` is null. Use it
 * in unit tests, Storybook and screenshot pages.
 */

'use client';

import React, { type ReactNode } from 'react';
import { AuthContext } from './lib/context.js';
import type { AuthContextValue, User } from './types/index.js';

/** Props of {@link HyperyTestProvider}: any context field can be overridden. */
export interface HyperyTestProviderProps extends Partial<Omit<AuthContextValue, 'user'>> {
  /** The signed-in user; `null` or omitted renders signed out. */
  user?: User | null;
  children?: ReactNode;
}

const noop = async () => {};

/**
 * Static auth context for tests and stories.
 *
 * @example
 * ```tsx
 * import { HyperyTestProvider } from '@hyperyai/sdk/testing';
 *
 * <HyperyTestProvider user={{ id: 'u_1', name: 'Ada Lovelace', email: 'ada@example.com' }}>
 *   <UserButton showUserInfo />
 * </HyperyTestProvider>
 * ```
 */
export function HyperyTestProvider({ user = null, children, ...overrides }: HyperyTestProviderProps) {
  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading: false,
    error: null,
    isLoggingOut: false,
    login: noop,
    loginPopup: async () => ({ ok: false, blocked: false, cancelled: true }),
    interactionMode: 'popup',
    redirectUri: 'http://localhost/callback',
    signUp: noop,
    logout: noop,
    refreshAuth: noop,
    getAccessToken: async () => (user ? 'test-access-token' : null),
    clientId: 'test-client',
    gatewayUrl: 'https://hypery.test',
    authenticatedFetch: (input, init) => fetch(input, init),
    restriction: null,
    clearRestriction: () => {},
    authRequired: false,
    clearAuthRequired: () => {},
    ...overrides,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
