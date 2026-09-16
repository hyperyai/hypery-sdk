/**
 * Where `logout()` sends the browser once the session has been revoked and
 * cleared.
 *
 * Historically this was hardcoded to `'/'`, which is wrong for any app whose
 * root is a marketing page (or, in a desktop shell, is not a navigable route at
 * all). `HyperyAuthConfig.postLogoutRedirect` makes it configurable; the
 * default is unchanged.
 */

import type { PostLogoutRedirect } from '../types';

/** The historical destination — kept as the default so behaviour is unchanged. */
export const DEFAULT_POST_LOGOUT_REDIRECT = '/';

/**
 * Resolve the configured option into the URL `logout()` should navigate to, or
 * `null` meaning "do not navigate — state is cleared, the app decides".
 *
 * Pure, so the decision is testable without a DOM:
 *   - `undefined`              → the default (`'/'`)
 *   - a non-empty string       → that URL
 *   - `false` / `null` / `''`  → no navigation
 *   - a function               → called, and its return value resolved by the
 *                                same rules; returning `undefined` (i.e. the
 *                                callback navigated itself) means no navigation
 *
 * A throwing callback is contained: logout must not fail because a consumer's
 * redirect hook did.
 */
export function resolvePostLogoutRedirect(
  option: PostLogoutRedirect | undefined
): string | null {
  if (option === undefined) return DEFAULT_POST_LOGOUT_REDIRECT;

  let value: string | false | null | void = option as Exclude<
    PostLogoutRedirect,
    () => unknown
  >;

  if (typeof option === 'function') {
    try {
      value = option();
    } catch (err) {
      console.error('postLogoutRedirect callback threw:', err);
      return null;
    }
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
