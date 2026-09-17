# Advanced: token storage and OAuth utilities

Low-level building blocks used by `HyperyProvider`. Most apps never need them;
they are exported for custom integrations (a non-React callback page, a service
worker, tests).

> Back to [README](../README.md) · Provider: [PROVIDER.md](./PROVIDER.md)

## `TokenStorage`

Reads and writes tokens and the cached user. In `memory` mode, or when `window`
is undefined (SSR), it uses an in-memory `Map`.

```ts
import { TokenStorage } from '@hyperyai/sdk';

const storage = new TokenStorage('sessionStorage');
const tokens = storage.getTokens();
if (!tokens || storage.isTokenExpired()) {
  // refresh
}
```

| Member | Signature | Description |
| --- | --- | --- |
| constructor | `new TokenStorage(storageType = 'localStorage')` | `'localStorage' \| 'sessionStorage' \| 'memory'`. |
| `saveTokens` | `(tokens: AuthTokens) => void` | Saves under `hypery_auth_tokens` with a `savedAt` timestamp. |
| `getTokens` | `() => (AuthTokens & { savedAt: number }) \| null` | `null` when missing or unparsable. |
| `isTokenExpired` | `() => boolean` | True when missing, or within 60 seconds of `savedAt + expiresIn`. |
| `clearTokens` | `() => void` | |
| `saveUser` | `(user: User) => void` | Saves under `hypery_auth_user`. |
| `getUser` | `() => User \| null` | |
| `clearUser` | `() => void` | |
| `clear` | `() => void` | Clears tokens and user. |

## OAuth utilities

PKCE authorization-code flow against `{gatewayUrl}/api/oauth/*`.

### `getAuthorizationUrl`

`getAuthorizationUrl(config): Promise<string>`

Generates a PKCE verifier/challenge, stores the verifier as
`hypery_oauth_verifier` and `hypery_oauth_state` (in `localStorage`/`sessionStorage`;
`memory` mode uses `sessionStorage`, or an in-memory fallback),
and returns `{gatewayUrl}/api/oauth/authorize?...` with
`code_challenge_method=S256`.

| Field | Type | Description |
| --- | --- | --- |
| `clientId` | `string` | |
| `redirectUri` | `string` | |
| `gatewayUrl` | `string` | |
| `scopes` | `string[]` | Joined with spaces. |
| `storage` | `'localStorage' \| 'sessionStorage' \| 'memory'` | Where the verifier is stored. |
| `state` | `string?` | Random if omitted. Stored and verified on return. |
| `provider` | `'google' \| 'github'` | Optional. Skips the hosted login page. |
| `prompt` | `'login' \| 'select_account' \| 'consent'` | Optional. |

```ts
import { getAuthorizationUrl } from '@hyperyai/sdk';

window.location.href = await getAuthorizationUrl({
  clientId, redirectUri, gatewayUrl, scopes: ['read', 'ai:chat'], storage: 'localStorage',
});
```

### `exchangeCodeForToken`

`exchangeCodeForToken(code, { clientId, redirectUri, gatewayUrl, storage, state? }): Promise<AuthTokens>`

Posts `grant_type=authorization_code` with the stored verifier to
`/api/oauth/token`, then removes the verifier and state. When `state` is passed
(the value from the callback URL; `null` if absent) it is compared with the stored
one first and a mismatch throws `OAuth state mismatch…` without any request.
Throws `OAuth verifier not found` when there is no verifier, or the server's
`error_description` / `error` on failure.

```ts
const params = new URLSearchParams(location.search);
const tokens = await exchangeCodeForToken(params.get('code')!, {
  clientId, redirectUri, gatewayUrl, storage: 'localStorage', state: params.get('state'),
});
new TokenStorage().saveTokens(tokens);
```

### `refreshAccessToken`

`refreshAccessToken(refreshToken, { clientId, gatewayUrl }): Promise<AuthTokens>`

Posts `grant_type=refresh_token` to `/api/oauth/token`. Throws on failure.

```ts
const next = await refreshAccessToken(tokens.refreshToken, { clientId, gatewayUrl });
```

### `getUserInfo`

`getUserInfo(accessToken, gatewayUrl): Promise<{ id: string; email: string; name: string; image?: string }>`

`GET {gatewayUrl}/api/user/me` with the bearer token. Throws an
[`AuthError`](#autherror) on a non-2xx response.

```ts
const user = await getUserInfo(tokens.accessToken, gatewayUrl);
```

`AuthTokens`: `{ accessToken, refreshToken, expiresIn, tokenType }` (`expiresIn` in seconds).

### `AuthError`

`class AuthError extends Error { status: number; code?: string; isCredentialFailure: boolean }`

Thrown by `exchangeCodeForToken`, `refreshAccessToken` and `getUserInfo` when the gateway **answered** with a
non-2xx. `status` is the HTTP status; `code` is the OAuth error code when the body carried one (e.g.
`invalid_grant`).

A request that never reached the gateway — offline, DNS, TLS, a connection reset — rejects with whatever
`fetch` threw (usually a `TypeError`) and is deliberately *not* an `AuthError`.

### `isCredentialFailure`

`isCredentialFailure(err: unknown): boolean`

True only when the server rejected the credentials themselves: a 400/401/403, or an `invalid_grant` /
`invalid_token` / `unauthorized_client` code. False for 5xx, 429, and every network failure.

Use it to decide whether to discard a session. Clearing tokens on any failure signs people out whenever the
network hiccups or the gateway has a bad minute:

```ts
try {
  const tokens = await refreshAccessToken(refreshToken, { clientId, gatewayUrl });
  storage.saveTokens(tokens);
} catch (err) {
  if (isCredentialFailure(err)) storage.clear(); // genuinely revoked — sign out
  else /* transient: keep the session and try again later */;
}
```

The provider applies exactly this rule internally, so `HyperyProvider` keeps a session across an offline
page load or a gateway blip, and only signs out when the gateway says the credentials are dead.
