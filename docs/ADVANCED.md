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
`hypery_oauth_verifier` in `localStorage`/`sessionStorage` (not in `memory` mode),
and returns `{gatewayUrl}/api/oauth/authorize?...` with
`code_challenge_method=S256`.

| Field | Type | Description |
| --- | --- | --- |
| `clientId` | `string` | |
| `redirectUri` | `string` | |
| `gatewayUrl` | `string` | |
| `scopes` | `string[]` | Joined with spaces. |
| `storage` | `'localStorage' \| 'sessionStorage' \| 'memory'` | Where the verifier is stored. |
| `state` | `string?` | Random if omitted. The SDK does not validate `state` on return. |
| `prompt` | `'login' \| 'select_account' \| 'consent'` | Optional. |

```ts
import { getAuthorizationUrl } from '@hyperyai/sdk';

window.location.href = await getAuthorizationUrl({
  clientId, redirectUri, gatewayUrl, scopes: ['read', 'ai:chat'], storage: 'localStorage',
});
```

### `exchangeCodeForToken`

`exchangeCodeForToken(code, { clientId, redirectUri, gatewayUrl, storage }): Promise<AuthTokens>`

Posts `grant_type=authorization_code` with the stored verifier to
`/api/oauth/token`, then removes the verifier. Throws `OAuth verifier not found`
when there is no verifier, or the server's `error_description` / `error` on failure.

```ts
const code = new URLSearchParams(location.search).get('code')!;
const tokens = await exchangeCodeForToken(code, { clientId, redirectUri, gatewayUrl, storage: 'localStorage' });
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

`GET {gatewayUrl}/api/user/me` with the bearer token. Throws
`Failed to fetch user info` on a non-2xx response.

```ts
const user = await getUserInfo(tokens.accessToken, gatewayUrl);
```

`AuthTokens`: `{ accessToken, refreshToken, expiresIn, tokenType }` (`expiresIn` in seconds).
