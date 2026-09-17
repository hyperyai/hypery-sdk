/**
 * OAuth utilities for authenticating with the Hypery
 * Implements PKCE (Proof Key for Code Exchange) flow for secure authentication
 */

import type { AuthTokens } from '../types';

/**
 * Generate random string for PKCE verifier
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate PKCE challenge for secure OAuth flow
 */
export async function generatePKCE(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = generateRandomString(32);

  // Hash the verifier
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const challenge = base64UrlEncode(hash);

  return { verifier, challenge };
}

type StorageType = 'localStorage' | 'sessionStorage' | 'memory';

const VERIFIER_KEY = 'hypery_oauth_verifier';
const STATE_KEY = 'hypery_oauth_state';

/** In-memory fallback for the login transaction when no Web Storage is available. */
const memoryTransaction = new Map<string, string>();

/**
 * Where the short-lived login transaction (PKCE verifier + `state`) lives.
 * `localStorage`/`sessionStorage` use that store. `memory` keeps TOKENS in
 * memory but must still survive the authorize redirect, so the transaction goes
 * to `sessionStorage` when available (tab-scoped, removed after the exchange),
 * falling back to an in-memory map (popup login only) when it is not.
 */
function transactionStore(storage: StorageType): Storage | Map<string, string> {
  try {
    if (typeof window !== 'undefined') {
      if (storage === 'localStorage' && typeof localStorage !== 'undefined') return localStorage;
      if (typeof sessionStorage !== 'undefined') return sessionStorage;
    }
  } catch {
    // Access to Web Storage can throw (privacy modes) — fall through.
  }
  return memoryTransaction;
}

function txGet(storage: StorageType, key: string): string | null {
  const store = transactionStore(storage);
  return store instanceof Map ? store.get(key) ?? null : store.getItem(key);
}

function txSet(storage: StorageType, key: string, value: string): void {
  const store = transactionStore(storage);
  if (store instanceof Map) store.set(key, value);
  else store.setItem(key, value);
}

function txRemove(storage: StorageType, key: string): void {
  const store = transactionStore(storage);
  if (store instanceof Map) store.delete(key);
  else store.removeItem(key);
}

/** Remove the stored PKCE verifier and `state` (after an exchange or on logout). */
export function clearOAuthTransaction(storage: StorageType): void {
  txRemove(storage, VERIFIER_KEY);
  txRemove(storage, STATE_KEY);
}

/**
 * Throw unless `returnedState` equals the `state` stored when the authorization
 * URL was built. Guards the callback against login CSRF / injected codes.
 */
export function verifyOAuthState(storage: StorageType, returnedState: string | null | undefined): void {
  const expected = txGet(storage, STATE_KEY);
  if (!expected || !returnedState || expected !== returnedState) {
    throw new Error('OAuth state mismatch: the authorization response does not match this login attempt');
  }
}

/**
 * Build the OAuth authorization URL. Generates a PKCE pair and a `state`, and
 * stores both (`hypery_oauth_verifier` / `hypery_oauth_state`) for the callback.
 * In `memory` mode they go to `sessionStorage` (or an in-memory fallback).
 */
export async function getAuthorizationUrl(config: {
  clientId: string;
  redirectUri: string;
  gatewayUrl: string;
  scopes: string[];
  storage: 'localStorage' | 'sessionStorage' | 'memory';
  state?: string;
  prompt?: 'login' | 'select_account' | 'consent';
  /** Skip the hosted login page and go straight to this identity provider. */
  provider?: 'google' | 'github';
}): Promise<string> {
  const { verifier, challenge } = await generatePKCE();
  const state = config.state || generateRandomString(16);

  // Store verifier + state (used and checked when the code comes back).
  txSet(config.storage, VERIFIER_KEY, verifier);
  txSet(config.storage, STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });

  // Add prompt parameter if provided (forces account selection or re-authentication)
  if (config.prompt) {
    params.set('prompt', config.prompt);
  }
  if (config.provider) {
    params.set('provider', config.provider);
  }

  return `${config.gatewayUrl}/api/oauth/authorize?${params.toString()}`;
}

/**
 * A failure the gateway *answered* — it responded, and the response says this token or grant is no good.
 *
 * The distinction matters: a caller may only discard a session when the server actually rejected it. A fetch
 * that rejects (offline, DNS, TLS, connection reset) or a 5xx never produces one of these, because none of
 * those tell us anything about whether the credentials are still valid.
 */
export class AuthError extends Error {
  readonly status: number;
  /** The OAuth error code when the body carried one, e.g. `invalid_grant`. */
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }

  /**
   * True when the server rejected the credentials themselves, so retrying with the same ones is pointless
   * and clearing them is correct. 4xx only — a 500/502/503 is the gateway failing, not the token.
   * `invalid_grant` is the OAuth code for a refresh token that is expired, revoked or already used.
   */
  get isCredentialFailure(): boolean {
    if (this.code === 'invalid_grant' || this.code === 'invalid_token' || this.code === 'unauthorized_client') return true;
    return this.status === 400 || this.status === 401 || this.status === 403;
  }
}

/** Did the server reject our credentials? False for network failures, 5xx, and anything else. */
export function isCredentialFailure(err: unknown): boolean {
  return err instanceof AuthError && err.isCredentialFailure;
}

/** Read an OAuth error body without letting a non-JSON response (an HTML 502 page) mask the status. */
async function readOAuthError(response: Response): Promise<{ message?: string; code?: string }> {
  try {
    const body = await response.json();
    return { message: body?.error_description || body?.error, code: typeof body?.error === 'string' ? body.error : undefined };
  } catch {
    return {};
  }
}

/**
 * Exchange an authorization code for tokens using the stored PKCE verifier.
 * When `config.state` is passed (the `state` returned on the callback) it is
 * verified against the stored one first; a mismatch throws before any request.
 * Throws when the verifier is missing or the token request fails.
 */
export async function exchangeCodeForToken(
  code: string,
  config: {
    clientId: string;
    redirectUri: string;
    gatewayUrl: string;
    storage: 'localStorage' | 'sessionStorage' | 'memory';
    /** `state` from the callback URL; verified when provided. */
    state?: string | null;
  }
): Promise<AuthTokens> {
  if (config.state !== undefined) {
    verifyOAuthState(config.storage, config.state);
  }

  const verifier = txGet(config.storage, VERIFIER_KEY);

  if (!verifier) {
    throw new Error('OAuth verifier not found');
  }

  // Call core API directly - PKCE flow doesn't need client_secret
  const response = await fetch(`${config.gatewayUrl}/api/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const { message, code } = await readOAuthError(response);
    throw new AuthError(message || 'Failed to exchange code for token', response.status, code);
  }

  // Clear the one-time transaction
  clearOAuthTransaction(config.storage);

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  };
}

/**
 * Exchange a refresh token for new tokens. Throws on failure.
 */
export async function refreshAccessToken(
  refreshToken: string,
  config: {
    clientId: string;
    gatewayUrl: string;
  }
): Promise<AuthTokens> {
  const response = await fetch(`${config.gatewayUrl}/api/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
    }),
  });

  if (!response.ok) {
    const { message, code } = await readOAuthError(response);
    throw new AuthError(message || 'Failed to refresh token', response.status, code);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  };
}

/**
 * Fetch the signed-in user (`GET {gatewayUrl}/api/user/me`). Throws on a non-2xx response.
 */
export async function getUserInfo(
  accessToken: string,
  gatewayUrl: string
): Promise<{ id: string; email: string; name: string; image?: string }> {
  const response = await fetch(`${gatewayUrl}/api/user/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new AuthError('Failed to fetch user info', response.status);
  }

  return response.json();
}

