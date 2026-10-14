/**
 * Incremental OAuth scope upgrade.
 *
 * Hypery's authorize endpoint signs in silently when every requested scope is
 * already granted, shows consent again for any new one, and merges the granted
 * set after consent. These helpers detect a missing scope on an API response
 * (`403` + `insufficient_scope`) and run the authorize flow (PKCE + state) for
 * the UNION of the current and the requested scopes, by redirect, popup, or a
 * host-supplied "open this URL and hand me the callback" function (native shells).
 */

import type { AuthTokens } from '../types/index.js';
import { exchangeCodeForToken, getAuthorizationUrl } from './oauth.js';
import { openPopup } from './popup.js';
import type { TokenStorage } from './storage.js';

/** Split a space-separated OAuth `scope` string into scopes (empty for none). */
export function parseScopeString(scope: string | null | undefined): string[] {
  return (scope || '').split(/\s+/).filter(Boolean);
}

/** Union of scope lists, first-seen order, without duplicates. */
export function mergeScopes(...lists: Array<readonly string[] | null | undefined>): string[] {
  const out: string[] = [];
  for (const list of lists) for (const s of list || []) if (s && !out.includes(s)) out.push(s);
  return out;
}

/** Thrown (or returned by {@link parseInsufficientScope}) when a token lacks a scope a Hypery API needs. */
export class InsufficientScopeError extends Error {
  readonly code = 'insufficient_scope' as const;
  readonly status = 403;
  /** The scope(s) the API asked for; empty when the response named none. */
  readonly requiredScopes: string[];
  constructor(requiredScopes: string[], message?: string) {
    super(message || `OAuth token requires the ${requiredScopes.join(' ') || 'missing'} scope`);
    this.name = 'InsufficientScopeError';
    this.requiredScopes = requiredScopes;
  }
}

/** True for an {@link InsufficientScopeError} (also across bundle copies, by `code`). */
export function isInsufficientScopeError(err: unknown): err is InsufficientScopeError {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'insufficient_scope'
    && Array.isArray((err as { requiredScopes?: unknown }).requiredScopes);
}

/** `scope="a b"` from an RFC 6750 `WWW-Authenticate: Bearer error="insufficient_scope", scope="…"` header. */
function scopesFromWwwAuthenticate(header: string | null): { insufficient: boolean; scopes: string[] } {
  if (!header) return { insufficient: false, scopes: [] };
  const insufficient = /error\s*=\s*"?insufficient_scope"?/i.test(header);
  const m = /scope\s*=\s*"([^"]*)"/i.exec(header);
  return { insufficient, scopes: parseScopeString(m?.[1]) };
}

/**
 * Read an API response and return an {@link InsufficientScopeError} when it is a
 * `403` with `insufficient_scope`, else `null`. Hypery answers
 * `{ error: { message: 'OAuth token requires the ai:embeddings scope', type, code: 'insufficient_scope' } }`;
 * the scope is taken from `error.scope`/`error.scopes`, a `WWW-Authenticate`
 * `scope="…"`, or the message, in that order. Does not consume the body.
 */
export async function parseInsufficientScope(response: Response): Promise<InsufficientScopeError | null> {
  if (response.status !== 403) return null;
  const header = scopesFromWwwAuthenticate(response.headers.get('WWW-Authenticate'));
  let body: any = null;
  try {
    body = await response.clone().json();
  } catch {
    /* not JSON */
  }
  const err = body && typeof body === 'object' ? (typeof body.error === 'object' && body.error ? body.error : body) : null;
  const flagged = header.insufficient || err?.code === 'insufficient_scope' || err?.type === 'insufficient_scope'
    || body?.error === 'insufficient_scope';
  if (!flagged) return null;
  const message: string | undefined = typeof err?.message === 'string' ? err.message
    : typeof body?.error_description === 'string' ? body.error_description : undefined;
  let scopes: string[] = Array.isArray(err?.scopes) ? err.scopes.filter((s: unknown) => typeof s === 'string')
    : typeof err?.scope === 'string' ? parseScopeString(err.scope) : [];
  if (!scopes.length) scopes = header.scopes;
  if (!scopes.length && message) {
    const m = /requires? the (.+?) scopes?\b/i.exec(message);
    if (m) scopes = parseScopeString(m[1].replace(/,|\band\b|\bor\b/g, ' '));
  }
  return new InsufficientScopeError(scopes, message);
}

/** Throw the {@link InsufficientScopeError} for `response` if it is one; otherwise return `response`. */
export async function throwIfInsufficientScope(response: Response): Promise<Response> {
  const err = await parseInsufficientScope(response);
  if (err) throw err;
  return response;
}

/**
 * Opens the authorize URL somewhere the app does not control (a system browser,
 * a native webview) and resolves with the full callback URL it lands on
 * (`redirectUri?code=…&state=…`), or `null` if the user cancelled.
 * PopCraft's Tauri shell implements this with `hypery_auth_start`.
 */
export type OpenAuthUrl = (authorizeUrl: string, redirectUri: string) => Promise<string | null>;

/** How {@link requestScopes} shows the authorize page. */
export type ScopeRequestMode = 'redirect' | 'popup' | 'external';

/** Options for the standalone {@link requestScopes}. */
export interface RequestScopesOptions {
  clientId: string;
  redirectUri: string;
  gatewayUrl: string;
  storage?: 'localStorage' | 'sessionStorage' | 'memory';
  /** Scopes held now; the request asks for these plus the new ones. */
  currentScopes?: readonly string[];
  /** Defaults to `'external'` when `openUrl` is given, else `'popup'`. */
  mode?: ScopeRequestMode;
  /** Required for `'external'` mode. */
  openUrl?: OpenAuthUrl;
  /** Where the new tokens are saved (replacing the old ones). */
  tokenStorage?: TokenStorage;
  /** A window opened in the user gesture (see `openBlankPopup`), reused for popup mode. */
  popup?: Window | null;
}

/** Result of {@link requestScopes}. */
export type RequestScopesResult =
  | { ok: true; tokens: AuthTokens; grantedScopes: string[] }
  | { ok: false; reason: 'redirecting' | 'blocked' | 'cancelled' | 'denied'; error?: string };

/** window.open target name shared with the provider's callback relay. */
export const AUTH_POPUP_NAME = 'hypery-sdk-popup';

/**
 * Run the authorize flow (PKCE + state) for the union of `currentScopes` and
 * `scopes`. Already-granted scopes sign in silently; new ones show consent. On
 * success the new tokens are saved to `tokenStorage` (when given) and returned
 * with the granted scopes from the token response. `'redirect'` navigates away
 * and resolves `{ ok: false, reason: 'redirecting' }`; `HyperyProvider`
 * finishes the exchange on the callback page.
 */
export async function requestScopes(scopes: readonly string[], opts: RequestScopesOptions): Promise<RequestScopesResult> {
  const storage = opts.storage || 'localStorage';
  const mode: ScopeRequestMode = opts.mode || (opts.openUrl ? 'external' : 'popup');
  const all = mergeScopes(opts.currentScopes, scopes);
  const url = await getAuthorizationUrl({
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    gatewayUrl: opts.gatewayUrl,
    scopes: all,
    storage,
  });

  let code: string | null = null;
  let state: string | null = null;
  let oauthError: string | null = null;

  if (mode === 'redirect') {
    if (typeof window !== 'undefined') window.location.href = url;
    return { ok: false, reason: 'redirecting' };
  } else if (mode === 'popup') {
    const result = await openPopup<{ code?: string; state?: string | null; error?: string }>({
      url,
      name: AUTH_POPUP_NAME,
      expectedOrigin: new URL(opts.redirectUri).origin,
      messageType: 'hypery:auth',
      ...(opts.popup !== undefined ? { existing: opts.popup } : {}),
    });
    if (result.blocked) return { ok: false, reason: 'blocked' };
    if (result.cancelled) return { ok: false, reason: 'cancelled' };
    code = result.data?.code || null;
    state = result.data?.state ?? null;
    oauthError = result.data?.error || null;
  } else {
    if (!opts.openUrl) throw new Error("requestScopes: 'external' mode needs an openUrl function");
    const callback = await opts.openUrl(url, opts.redirectUri);
    if (!callback) return { ok: false, reason: 'cancelled' };
    const params = new URL(callback).searchParams;
    code = params.get('code');
    state = params.get('state');
    oauthError = params.get('error');
  }

  if (!code) {
    return oauthError ? { ok: false, reason: 'denied', error: oauthError } : { ok: false, reason: 'cancelled' };
  }

  const tokens = await exchangeCodeForToken(code, {
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    gatewayUrl: opts.gatewayUrl,
    storage,
    state,
  });
  opts.tokenStorage?.saveTokens(tokens);
  return { ok: true, tokens, grantedScopes: tokens.scopes ?? all };
}

/**
 * Run `fn`; if it fails for a missing scope (throws an {@link InsufficientScopeError}
 * or returns a `403 insufficient_scope` Response), ask for `scope` (plus any the
 * response named) ONCE via `request`, then run `fn` again. When the upgrade does
 * not succeed the original error is thrown.
 */
export async function withScope<T>(
  scope: string | readonly string[],
  fn: () => Promise<T>,
  request: (scopes: string[]) => Promise<RequestScopesResult>,
): Promise<T> {
  const wanted = typeof scope === 'string' ? [scope] : [...scope];
  let missing: InsufficientScopeError | null = null;
  try {
    const value = await fn();
    if (value instanceof Response) missing = await parseInsufficientScope(value);
    if (!missing) return value;
  } catch (err) {
    if (!isInsufficientScopeError(err)) throw err;
    missing = err;
  }
  const result = await request(mergeScopes(wanted, missing.requiredScopes));
  if (!result.ok) throw missing;
  return fn();
}
