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

/**
 * Build OAuth authorization URL
 */
export async function getAuthorizationUrl(config: {
  clientId: string;
  redirectUri: string;
  gatewayUrl: string;
  scopes: string[];
  storage: 'localStorage' | 'sessionStorage' | 'memory';
  state?: string;
  prompt?: 'login' | 'select_account' | 'consent';
}): Promise<string> {
  const { verifier, challenge } = await generatePKCE();

  // Store verifier (will be used when exchanging code for token)
  if (config.storage !== 'memory' && typeof window !== 'undefined') {
    const storage =
      config.storage === 'localStorage' ? localStorage : sessionStorage;
    storage.setItem('hypery_oauth_verifier', verifier);
  }

  const state = config.state || generateRandomString(16);

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

  return `${config.gatewayUrl}/api/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  config: {
    clientId: string;
    redirectUri: string;
    gatewayUrl: string;
    storage: 'localStorage' | 'sessionStorage' | 'memory';
  }
): Promise<AuthTokens> {
  let verifier: string | null = null;

  // Get verifier from storage
  if (config.storage !== 'memory' && typeof window !== 'undefined') {
    const storage =
      config.storage === 'localStorage' ? localStorage : sessionStorage;
    verifier = storage.getItem('hypery_oauth_verifier');
  }

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
    const error = await response.json();
    throw new Error(
      error.error_description || error.error || 'Failed to exchange code for token'
    );
  }

  // Clear verifier
  if (config.storage !== 'memory' && typeof window !== 'undefined') {
    const storage =
      config.storage === 'localStorage' ? localStorage : sessionStorage;
    storage.removeItem('hypery_oauth_verifier');
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
 * Refresh access token
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
    const error = await response.json();
    throw new Error(
      error.error_description || error.error || 'Failed to refresh token'
    );
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
 * Get user info from access token
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
    throw new Error('Failed to fetch user info');
  }

  return response.json();
}

