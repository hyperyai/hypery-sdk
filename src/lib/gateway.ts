/**
 * Gateway URL resolution + small response helpers shared by hooks/components.
 * @internal
 */

/**
 * Resolve the Hypery base URL. Precedence: explicit argument/prop >
 * `HyperyProvider` `config.gatewayUrl` > `NEXT_PUBLIC_GATEWAY_URL` > `''`
 * (a relative request). Trailing slashes are trimmed.
 */
export function resolveGatewayUrl(explicit?: string | null, providerUrl?: string | null): string {
  const env =
    typeof process !== 'undefined' ? (process.env?.NEXT_PUBLIC_GATEWAY_URL as string | undefined) : undefined;
  const url = explicit || providerUrl || env || '';
  return url.replace(/\/+$/, '');
}

/**
 * Human-readable message from an API error body. Handles `{ error: 'msg' }`,
 * `{ error: { message } }`, `{ message }` and `{ error_description }`, so
 * callers never surface "[object Object]".
 */
export function errorMessageFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const b = body as Record<string, any>;
  const e = b.error;
  if (typeof e === 'string' && e) return e;
  if (e && typeof e === 'object' && typeof e.message === 'string' && e.message) return e.message;
  if (typeof b.error_description === 'string' && b.error_description) return b.error_description;
  if (typeof b.message === 'string' && b.message) return b.message;
  return fallback;
}
