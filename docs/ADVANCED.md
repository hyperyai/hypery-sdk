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
| `hideProviders` | `Array<'apple' \| 'google' \| 'github'>` | Optional. Leaves these off the hosted login and sign-up pages (e.g. `['apple']` in an App Store build that uses `signInWithAppleNative`). |
| `prompt` | `'login' \| 'select_account' \| 'consent'` | Optional. |

```ts
import { getAuthorizationUrl } from '@hyperyai/sdk';

window.location.href = await getAuthorizationUrl({
  clientId, redirectUri, gatewayUrl, scopes: ['read', 'ai:chat'], storage: 'localStorage',
});
```

### `signInWithAppleNative`

`signInWithAppleNative({ clientId, gatewayUrl, scopes, redirectUri, storage?, requestCredential }): Promise<AuthTokens>`

Native Sign in with Apple for an app's iOS / Mac App Store build. App Review
(guideline 4) wants Sign in with Apple finished inside the app, not on the hosted
page. The app shows Apple's own sheet; the SDK sends the identity token to Hypery
(`/api/oauth/apple-native`) and exchanges the authorization code it answers with.
Store the returned tokens yourself (`new TokenStorage(storage).saveTokens(tokens)`).

`requestCredential` (type `RequestAppleCredential`) is your native bridge,
`(nonce: string) => Promise<AppleCredential>`: show `ASAuthorizationController` with
an `ASAuthorizationAppleIDProvider` request whose `nonce` is the string given (already
SHA-256 hashed), and answer an `AppleCredential`:
`{ identityToken, givenName?, familyName? }`, `{ cancelled: true }` when the person
closes the sheet, or `{ unavailable: true }` when Apple refuses at once
(`ASAuthorizationError.unknown`: the App ID lacks the capability).

Setup per app: the Sign in with Apple capability on the App ID (and the
`com.apple.developer.applesignin` entitlement in the build), and the bundle id in the
app's App Store config on Hypery.

Throws:

| Error | When |
| --- | --- |
| `AppleSignInCancelled` | The person closed Apple's sheet. |
| `AppleSignInUnavailable` | The app can't show the sheet; use the hosted sign-in. |
| `AppleTwoFactorRequired` | The account uses two-factor. Call `error.complete(code, 'totp' \| 'backup')` for the tokens; it throws on a wrong code and can be retried. |
| `Error` | Anything else, with a message to show (e.g. an existing account not linked to Apple). |

`NativeSignInDialog` wraps all of this in a dialog. Options type: `SignInWithAppleNativeOptions`.

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

`GET {gatewayUrl}/api/user/me` with the bearer token. Throws
`Failed to fetch user info` on a non-2xx response.

```ts
const user = await getUserInfo(tokens.accessToken, gatewayUrl);
```

`AuthTokens`: `{ accessToken, refreshToken, expiresIn, tokenType }` (`expiresIn` in seconds).
