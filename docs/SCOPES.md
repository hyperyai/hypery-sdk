# Scopes: asking for more later

Sign in with the scopes your app needs on day one, then ask for more when a feature needs them. Hypery's authorize
endpoint makes this cheap:

- scopes the user already granted sign in silently, with no screen;
- any new scope shows the consent screen again, for the new scopes only;
- after consent the grant is merged, so the new token carries the old scopes and the new ones.

## In a React app

```tsx
import { useAuth } from '@hyperyai/sdk';

function Narrate({ text }: { text: string }) {
  const { authenticatedFetch, gatewayUrl, grantedScopes, withScope } = useAuth();

  const speak = () =>
    withScope('ai:audio', () =>
      authenticatedFetch(`${gatewayUrl}/api/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', input: text, voice: 'alloy' }),
      }),
    );

  return <button onClick={speak}>{grantedScopes?.includes('ai:audio') ? 'Play' : 'Allow audio and play'}</button>;
}
```

`withScope` runs the function. When it fails for a missing scope, it asks for the scope once and runs the function
again. If the user cancels or declines, the original `InsufficientScopeError` is thrown.

Call `requestScopes` yourself to ask up front, e.g. from a settings toggle:

```ts
const { requestScopes } = useAuth();
const result = await requestScopes(['ai:audio', 'ai:embeddings']);
if (result.ok) console.log('now granted:', result.grantedScopes);
```

### `requestScopes(scopes, options?)`

Runs the authorize flow (PKCE plus `state`) for the union of the token's granted scopes (or the configured `scopes`
when the token did not say) and `scopes`. The new token replaces the stored one and `grantedScopes` updates.

| Option | Type | Description |
| --- | --- | --- |
| `mode` | `ScopeRequestMode` | `'popup'`, `'redirect'` or `'external'`. Defaults to `'external'` when `config.openAuthUrl` is set, else the resolved `interactionMode`. |
| `popup` | `Window \| null` | A window opened with `openBlankPopup` inside the click handler, so a blocker allows it. |

`ScopeRequestMode`:

- `'popup'` opens the authorize page in a popup; `redirectUri` must be same-origin. A blocked popup returns `{ ok: false, reason: 'blocked' }`; fall back to `'redirect'`.
- `'redirect'` navigates away and returns `{ ok: false, reason: 'redirecting' }`. `HyperyProvider` finishes on the callback page as for `login()`.
- `'external'` hands the URL to `openAuthUrl` (below).

`RequestScopesResult` is `{ ok: true, tokens, grantedScopes }` or
`{ ok: false, reason: 'redirecting' | 'blocked' | 'cancelled' | 'denied', error? }`.

### `grantedScopes`

The scopes the current token carries, read from the token response's `scope` field (also stored on
`AuthTokens.scopes`). A refresh response without `scope` keeps the previous list. `null` when signed out or unknown.

## Native hosts (Tauri, Electron, mobile)

A native shell signs in in the system browser or its own webview, so neither a popup nor a redirect fits. Give the
provider an `OpenAuthUrl`: open the URL, wait for the callback, resolve with the full callback URL (or `null` on
cancel). The SDK keeps the PKCE verifier and checks `state`, then exchanges the code.

```tsx
import { invoke } from '@tauri-apps/api/core';

<HyperyProvider
  config={{
    clientId,
    redirectUri: 'popcraft://auth/callback',
    gatewayUrl: 'https://hypery.ai',
    storage: 'memory',
    openAuthUrl: (url) => invoke<string | null>('hypery_auth_start', { url }),
  }}
>
```

`OpenAuthUrl` is `(authorizeUrl: string, redirectUri: string) => Promise<string | null>`. A callback with
`error=access_denied` returns `{ ok: false, reason: 'denied', error: 'access_denied' }`.

## Without React

The same functions work on their own:

```ts
import { requestScopes, withScope, throwIfInsufficientScope, TokenStorage } from '@hyperyai/sdk';

const tokenStorage = new TokenStorage('localStorage');
const ask = (scopes: string[]) =>
  requestScopes(scopes, {
    clientId, redirectUri, gatewayUrl,
    currentScopes: tokenStorage.getTokens()?.scopes,
    tokenStorage,
    mode: 'popup',
  });

const res = await withScope('ai:embeddings', async () =>
  throwIfInsufficientScope(await fetch(`${gatewayUrl}/api/v1/embeddings`, { /* … */ })),
  ask,
);
```

`RequestScopesOptions` takes `clientId`, `redirectUri`, `gatewayUrl`, `storage`, `currentScopes`, `mode`, `openUrl`,
`tokenStorage` and `popup`. `withScope(scope, fn, request)` takes the request function as its third argument.

## Detecting a missing scope

A Hypery API answers a token without the scope it needs with `403`:

```json
{ "error": { "message": "OAuth token requires the ai:embeddings scope", "type": "insufficient_scope", "code": "insufficient_scope" } }
```

- `parseInsufficientScope` (`(response) => Promise<InsufficientScopeError | null>`) returns an `InsufficientScopeError` for such a response, else `null`. It reads the
  scopes from `error.scope` / `error.scopes`, an RFC 6750 `WWW-Authenticate: Bearer error="insufficient_scope", scope="…"`
  header, or the message, in that order, and leaves the body unread.
- `throwIfInsufficientScope` (`(response) => Promise<Response>`) throws that error, or returns the response.
- `InsufficientScopeError` has `code: 'insufficient_scope'`, `status: 403` and `requiredScopes: string[]`.
- `isInsufficientScopeError` (`(err) => boolean`) checks by `code`, so it works across copies of the SDK.
- `mergeScopes` (`(...lists) => string[]`) and `parseScopeString` (`(scope) => string[]`) are the union and split helpers the flow uses.
