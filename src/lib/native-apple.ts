/**
 * Native Sign in with Apple, for an app's iOS / Mac App Store build.
 *
 * App Review (guideline 4) wants Sign in with Apple finished inside the app, not on
 * Hypery's hosted page. The app shows Apple's own sheet (a native call this SDK can't
 * make: pass it as `requestCredential`), and this hands the identity token to Hypery
 * (`/api/oauth/apple-native`), which answers with an ordinary PKCE authorization code
 * that is exchanged for tokens like any other sign-in.
 *
 * Setup per app: the Sign in with Apple capability on its App ID, and its bundle id in
 * the app's App Store config on Hypery. Without the capability Apple refuses at once;
 * `requestCredential` should then answer `{ unavailable: true }` and the app falls back
 * to the hosted sign-in (see `hideProviders` on `getAuthorizationUrl`).
 */

import type { AuthTokens } from '../types/index.js';
import { exchangeCodeForToken, generatePKCE, setOAuthVerifier } from './oauth.js';

/** What the app's native Apple sheet answered. */
export interface AppleCredential {
  /** The identity token (a JWT) from ASAuthorizationAppleIDCredential. */
  identityToken?: string;
  /** Shared by Apple only on the first sign-in to the app. */
  givenName?: string;
  familyName?: string;
  /** The person closed the sheet. */
  cancelled?: boolean;
  /** The app can't show the sheet (no Sign in with Apple capability). */
  unavailable?: boolean;
}

/**
 * Shows Apple's sheet with `nonce` (already SHA-256 hashed, hex: set it as the
 * request's nonce as given) and answers with what it returned.
 */
export type RequestAppleCredential = (nonce: string) => Promise<AppleCredential>;

/** Thrown when the person closes Apple's sheet: nothing to report. */
export class AppleSignInCancelled extends Error {
  constructor() {
    super('Sign in with Apple was cancelled');
    this.name = 'AppleSignInCancelled';
  }
}

/** Thrown when the app can't show Apple's sheet: sign in through the hosted page instead. */
export class AppleSignInUnavailable extends Error {
  constructor() {
    super('Sign in with Apple is not set up for this app');
    this.name = 'AppleSignInUnavailable';
  }
}

/**
 * Thrown when the account uses two-factor: Apple's part is done, and `complete` finishes
 * the sign-in with the authenticator code (or a backup code). `complete` throws on a
 * wrong code, with a message to show, and can be called again until the ticket expires.
 */
export class AppleTwoFactorRequired extends Error {
  constructor(readonly complete: (code: string, type?: 'totp' | 'backup') => Promise<AuthTokens>) {
    super('Enter your two-factor code');
    this.name = 'AppleTwoFactorRequired';
  }
}

/** Options of {@link signInWithAppleNative}. */
export interface SignInWithAppleNativeOptions {
  clientId: string;
  gatewayUrl: string;
  scopes: string[];
  /** A redirect URI registered for the app (the code isn't redirected, but it is bound to it). */
  redirectUri: string;
  storage?: 'localStorage' | 'sessionStorage' | 'memory';
  requestCredential: RequestAppleCredential;
}

function randomString(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

type Answer = {
  code?: string;
  state?: string;
  error_description?: string;
  two_factor_required?: boolean;
  ticket?: string;
};

/**
 * Sign in with Apple natively and return Hypery tokens (the caller stores them, e.g.
 * `new TokenStorage(storage).saveTokens(tokens)`). Throws {@link AppleSignInCancelled},
 * {@link AppleSignInUnavailable}, {@link AppleTwoFactorRequired}, or an Error whose
 * message can be shown (e.g. an existing account that isn't linked to Apple).
 */
export async function signInWithAppleNative(options: SignInWithAppleNativeOptions): Promise<AuthTokens> {
  const storage = options.storage ?? 'localStorage';
  const nonce = randomString();
  const credential = await options.requestCredential(await sha256Hex(nonce));
  if (credential.cancelled) throw new AppleSignInCancelled();
  if (credential.unavailable) throw new AppleSignInUnavailable();
  if (!credential.identityToken) throw new Error('Apple did not return a sign-in token');

  const { verifier, challenge } = await generatePKCE();
  const state = randomString(16);
  const res = await fetch(`${options.gatewayUrl}/api/oauth/apple-native`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      scope: options.scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      identity_token: credential.identityToken,
      nonce,
      given_name: credential.givenName,
      family_name: credential.familyName,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Answer;

  const finish = async (answer: Answer, ok: boolean): Promise<AuthTokens> => {
    if (!ok || !answer.code) throw new Error(answer.error_description || 'Sign in with Apple failed');
    if (answer.state !== state) throw new Error('Sign in with Apple failed');
    setOAuthVerifier(storage, verifier);
    return exchangeCodeForToken(answer.code, {
      clientId: options.clientId,
      redirectUri: options.redirectUri,
      gatewayUrl: options.gatewayUrl,
      storage,
    });
  };

  if (res.status === 202 && body.two_factor_required && body.ticket) {
    const ticket = body.ticket;
    throw new AppleTwoFactorRequired(async (code, type = 'totp') => {
      const r = await fetch(`${options.gatewayUrl}/api/oauth/apple-native/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, code, type }),
      });
      return finish((await r.json().catch(() => ({}))) as Answer, r.ok);
    });
  }
  return finish(body, res.ok);
}
