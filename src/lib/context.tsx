/**
 * Hypery Auth Context
 * Similar to Clerk's <ClerkProvider>
 */

'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type {
  HyperyAuthConfig,
  AuthContextValue,
  ParsedError,
  PopupAuthResult,
  ResolvedMode,
  User,
} from '../types';
import {
  getAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getUserInfo,
} from './oauth';
import { parseError } from './parse-error';
import { openPopup, resolveInteractionMode } from './popup';
import { TokenStorage } from './storage';

/** window.open target name; also read back in the callback to detect popup context. */
const AUTH_POPUP_NAME = 'hypery-auth-popup';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface HyperyProviderProps {
  config: HyperyAuthConfig;
  children: ReactNode;
}

/**
 * Hypery Auth Provider
 * Wrap your app with this component to enable authentication
 * 
 * @example
 * ```tsx
 * <HyperyProvider config={{
 *   clientId: 'your-client-id',
 *   redirectUri: 'http://localhost:3000/callback',
 *   gatewayUrl: 'https://api.aihypery.ai',
 *   scopes: ['read', 'write', 'ai:chat']
 * }}>
 *   <App />
 * </HyperyProvider>
 * ```
 */
export function HyperyProvider({
  config,
  children,
}: HyperyProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Turnkey modal state driven by authenticatedFetch (see <HyperyModals>).
  const [restriction, setRestriction] = useState<ParsedError | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  // Single-flight refresh: N concurrent expired requests share ONE token POST.
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const storage = new TokenStorage(config.storage || 'localStorage');
  // Default scopes match the app's default OAuth configuration.
  // Includes ai:images so image generation works without a custom scope list.
  const scopes = config.scopes || ['read', 'write', 'ai:chat', 'ai:completions', 'ai:models', 'ai:images', 'billing:read'];

  /**
   * Get valid access token (refreshes if needed)
   */
  const getAccessToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    const tokens = storage.getTokens();
    if (!tokens) return null;

    // Refresh when the local clock says expired, or when forced (the 401 retry
    // path — the server may have revoked a token our clock still thinks valid).
    if (forceRefresh || storage.isTokenExpired()) {
      // Single-flight: if a refresh is already running, await it instead of
      // firing another POST /api/oauth/token for every concurrent request.
      if (!refreshInFlight.current) {
        refreshInFlight.current = (async () => {
          try {
            const newTokens = await refreshAccessToken(tokens.refreshToken, {
              clientId: config.clientId,
              gatewayUrl: config.gatewayUrl,
            });
            storage.saveTokens(newTokens);
            return newTokens.accessToken;
          } catch (err) {
            console.error('Failed to refresh token:', err);
            storage.clear();
            setUser(null);
            return null;
          } finally {
            refreshInFlight.current = null;
          }
        })();
      }
      return refreshInFlight.current;
    }

    return tokens.accessToken;
  }, [config.clientId, config.gatewayUrl]);

  /**
   * fetch() wrapper that injects the bearer token and drives the turnkey modal
   * UX. On 401 it does ONE silent-refresh retry; if still 401 it flags
   * `authRequired` (and calls `config.onUnauthorized`). On a 402/429 billing
   * restriction it parses the canonical error and sets `restriction` (and calls
   * `config.onRestricted`). The Response is always returned so the caller can
   * still read the body / handle other statuses itself.
   */
  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
      const withToken = (token: string | null): RequestInit => ({
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      let token = await getAccessToken();
      let res = await fetch(input, withToken(token));

      if (res.status === 401) {
        // Force one refresh + retry before giving up.
        token = await getAccessToken(true);
        if (token) {
          res = await fetch(input, withToken(token));
        }
        if (res.status === 401) {
          setAuthRequired(true);
          config.onUnauthorized?.();
          return res;
        }
      }

      if (res.status === 402 || res.status === 429) {
        try {
          const body = await res.clone().json();
          const parsed = parseError({ ...body, status: res.status });
          setRestriction(parsed);
          config.onRestricted?.(parsed);
        } catch {
          // Non-JSON body — leave it to the caller.
        }
      }

      return res;
    },
    [getAccessToken, config],
  );

  /**
   * Load user from storage and validate token
   */
  const loadUser = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsLoggingOut(false); // Reset logout flag on fresh load

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Fetch fresh user info
      const userInfo = await getUserInfo(accessToken, config.gatewayUrl);
      storage.saveUser(userInfo);
      setUser(userInfo);
    } catch (err) {
      console.error('Failed to load user:', err);
      setError(err instanceof Error ? err.message : 'Failed to load user');
      storage.clear();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [config.gatewayUrl, getAccessToken]);

  /**
   * Initiate OAuth login flow
   */
  const login = useCallback(async () => {
    try {
      // Check if user just logged out (force account selection)
      const justLoggedOut = typeof window !== 'undefined' && 
        localStorage.getItem('hypery_force_reauth') === 'true';
      
      const authUrl = await getAuthorizationUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        gatewayUrl: config.gatewayUrl,
        scopes,
        storage: config.storage || 'localStorage',
        // Force account selection after logout to prevent auto-login
        prompt: justLoggedOut ? 'select_account' : undefined,
      });

      // Clear the flag
      if (justLoggedOut) {
        localStorage.removeItem('hypery_force_reauth');
      }

      window.location.href = authUrl;
    } catch (err) {
      console.error('Failed to initiate login:', err);
      setError(err instanceof Error ? err.message : 'Failed to initiate login');
    }
  }, [config, scopes]);

  /**
   * Initiate OAuth sign-up flow (forces account selection)
   */
  const signUp = useCallback(async () => {
    try {
      const authUrl = await getAuthorizationUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        gatewayUrl: config.gatewayUrl,
        scopes,
        storage: config.storage || 'localStorage',
        prompt: 'select_account', // Force account selection for sign-up
      });

      window.location.href = authUrl;
    } catch (err) {
      console.error('Failed to initiate sign-up:', err);
      setError(err instanceof Error ? err.message : 'Failed to initiate sign-up');
    }
  }, [config, scopes]);

  /**
   * Log in via a centered popup instead of a full-page redirect. The popup runs
   * the normal OAuth+PKCE flow; its callback page (this same provider, mounted
   * at redirectUri) posts the authorization code back here (see handleCallback),
   * and we exchange it with the verifier stored in THIS window. Same-origin
   * redirectUri required — the code is relayed via postMessage to the opener.
   */
  const loginPopup = useCallback(async (): Promise<PopupAuthResult> => {
    try {
      const authUrl = await getAuthorizationUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        gatewayUrl: config.gatewayUrl,
        scopes,
        storage: config.storage || 'localStorage',
      });
      const expectedOrigin = new URL(config.redirectUri).origin;
      const result = await openPopup<{ code: string }>({
        url: authUrl,
        name: AUTH_POPUP_NAME,
        expectedOrigin,
        messageType: 'hypery:auth',
      });
      if (result.blocked) return { ok: false, blocked: true, cancelled: false };
      if (result.cancelled || !result.data?.code) {
        return { ok: false, blocked: false, cancelled: true };
      }

      const tokens = await exchangeCodeForToken(result.data.code, {
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        gatewayUrl: config.gatewayUrl,
        storage: config.storage || 'localStorage',
      });
      storage.saveTokens(tokens);
      const userInfo = await getUserInfo(tokens.accessToken, config.gatewayUrl);
      storage.saveUser(userInfo);
      setUser(userInfo);
      return { ok: true, blocked: false, cancelled: false };
    } catch (err) {
      console.error('Popup login failed:', err);
      setError(err instanceof Error ? err.message : 'Popup login failed');
      return { ok: false, blocked: false, cancelled: true };
    }
  }, [config, scopes]);

  /**
   * Logout and clear session
   */
  const logout = useCallback(async () => {
    console.log('🚪 [AUTH] Logout initiated');
    
    // Set logging out flag to prevent Protect components from triggering login
    setIsLoggingOut(true);
    
    // Get the current access token before clearing
    const tokens = storage.getTokens();
    console.log('🔑 [AUTH] Found tokens:', tokens ? 'yes' : 'no');
    
    // Revoke the OAuth token on the server
    if (tokens?.accessToken) {
      try {
        console.log('📡 [AUTH] Calling revoke endpoint:', `${config.gatewayUrl}/api/oauth/revoke`);
        const response = await fetch(`${config.gatewayUrl}/api/oauth/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokens.accessToken }),
        });
        console.log('✅ [AUTH] OAuth token revoked on server, status:', response.status);
      } catch (err) {
        console.error('❌ [AUTH] Failed to revoke token on server:', err);
        // Continue with logout even if revocation fails
      }
    } else {
      console.log('⚠️ [AUTH] No access token found to revoke');
    }
    
    // Clear local storage
    console.log('🧹 [AUTH] Clearing local storage');
    storage.clear();
    setUser(null);
    setError(null);
    
    // Also clear OAuth verifier if it exists
    if (typeof window !== 'undefined') {
      const storageInstance = config.storage === 'sessionStorage' ? sessionStorage : localStorage;
      storageInstance.removeItem('hypery_oauth_verifier');
      
      // Set flag to force account selection on next login
      // This prevents auto-login after logout
      localStorage.setItem('hypery_force_reauth', 'true');
      console.log('✅ [AUTH] Set force reauth flag');
      
      // Redirect to local landing page
      // Note: This only logs out of THIS app, not the OAuth provider or other apps
      console.log('🔄 [AUTH] Redirecting to /');
      window.location.replace('/');
    }
  }, [config.storage, config.gatewayUrl, storage]);

  /**
   * Manually refresh auth state
   */
  const refreshAuth = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  /**
   * Handle OAuth callback
   */
  useEffect(() => {
    const handleCallback = async () => {
      if (typeof window === 'undefined') return;

      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');

      // Popup auth: this callback page is running inside the auth popup we opened.
      // Don't exchange here — relay the code to the opener (which holds the PKCE
      // verifier) and close. The opener validates event.origin (see loginPopup).
      if (code && window.opener && !window.opener.closed && window.name === AUTH_POPUP_NAME) {
        try {
          window.opener.postMessage({ type: 'hypery:auth', code }, window.location.origin);
        } catch (err) {
          console.error('Failed to relay auth code to opener:', err);
        }
        window.close();
        return;
      }

      if (code) {
        try {
          setIsLoading(true);

          // Exchange code for tokens
          const tokens = await exchangeCodeForToken(code, {
            clientId: config.clientId,
            redirectUri: config.redirectUri,
            gatewayUrl: config.gatewayUrl,
            storage: config.storage || 'localStorage',
          });

          storage.saveTokens(tokens);

          // Fetch user info
          const userInfo = await getUserInfo(
            tokens.accessToken,
            config.gatewayUrl
          );
          storage.saveUser(userInfo);
          setUser(userInfo);

          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err) {
          console.error('OAuth callback failed:', err);
          setError(
            err instanceof Error ? err.message : 'Authentication failed'
          );
        } finally {
          setIsLoading(false);
        }
      } else {
        // Not a callback, load existing session
        await loadUser();
      }
    };

    handleCallback();
  }, [config, loadUser]);

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    isLoggingOut,
    login,
    loginPopup,
    interactionMode: resolveInteractionMode(config.interactionMode) as ResolvedMode,
    redirectUri: config.redirectUri,
    signUp,
    logout,
    refreshAuth,
    getAccessToken,
    clientId: config.clientId,
    gatewayUrl: config.gatewayUrl,
    authenticatedFetch,
    restriction,
    clearRestriction: () => setRestriction(null),
    authRequired,
    clearAuthRequired: () => setAuthRequired(false),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth state and methods
 * Similar to Clerk's useAuth()
 * 
 * @example
 * ```tsx
 * const { user, isAuthenticated, login, logout } = useHyperyAuth();
 * ```
 */
export function useHyperyAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      'useHyperyAuth must be used within HyperyProvider'
    );
  }
  return context;
}

/**
 * Hook to access user data
 * Similar to Clerk's useUser()
 * 
 * @example
 * ```tsx
 * const { user, isLoading } = useUser();
 * ```
 */
export function useUser() {
  const { user, isLoading } = useHyperyAuth();
  return { user, isLoading };
}

