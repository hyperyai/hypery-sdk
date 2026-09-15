# HyperyProvider and configuration

Everything in `@hyperyai/sdk` reads from a single React context. Mount
`HyperyProvider` once, near the root of your app, and mount it on the page that
serves your `redirectUri` too (the provider handles the OAuth callback there).

> Back to [README](../README.md) · See also [Hooks](./HOOKS.md) · [Components](./COMPONENTS.md) · [Checkout](./CHECKOUT.md)

## `HyperyProvider`

```tsx
import { HyperyProvider, HyperyModals } from '@hyperyai/sdk';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <HyperyProvider
      config={{
        clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!,
        redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI!, // e.g. https://yourapp.com/callback
        gatewayUrl: 'https://hypery.ai',
        interactionMode: 'auto',
      }}
    >
      {children}
      <HyperyModals />
    </HyperyProvider>
  );
}
```

| Prop | Type | Description |
| --- | --- | --- |
| `config` | `HyperyAuthConfig` | Required. See below. |
| `children` | `ReactNode` | Required. |

What the provider does on mount:

- If the URL has a `?code=` query parameter, it first checks the returned
  `state` against the one stored when login started — on a mismatch it sets
  `error` ("OAuth state mismatch…") and does not exchange the code. Otherwise
  it exchanges the code for tokens (PKCE), stores them, fetches the user
  (`GET {gatewayUrl}/api/user/me`) and strips the query string from the URL.
- If that page is running inside the SDK's own login popup, it instead posts
  the code and `state` back to the opener window and closes itself; the opener
  verifies `state` the same way before exchanging.
- Otherwise it restores the existing session from storage, refreshing the
  access token if the stored expiry has passed (with a 60 second margin).

Tip: pass a stable `config` object (defined outside the component or memoised).
The callback/session effect depends on the `config` identity.

## `HyperyAuthConfig`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `clientId` | `string` | required | OAuth client id of your app. |
| `redirectUri` | `string` | required | OAuth redirect URI registered for the client. Must be same-origin with your app for popup mode. |
| `gatewayUrl` | `string` | required | Hypery base URL, e.g. `https://hypery.ai`. |
| `scopes` | `string[]` | `['read', 'write', 'ai:chat', 'ai:completions', 'ai:models', 'ai:images', 'billing:read']` | OAuth scopes requested at login. Add `billing:charge` for checkout / subscriptions. |
| `storage` | `'localStorage' \| 'sessionStorage' \| 'memory'` | `'localStorage'` | Where tokens and the cached user live. The one-time login transaction (PKCE verifier + OAuth `state`) uses the same store, except in `memory` mode: tokens stay in memory, but the transaction goes to `sessionStorage` (falling back to in-memory when unavailable) so the redirect login can complete; it is removed after the code exchange. |
| `interactionMode` | `InteractionMode` | `'auto'` | How interactive auth / card-entry steps are shown in the checkout flow. See below. |
| `onUnauthorized` | `() => void` | none | Called when an `authenticatedFetch` request is still `401` after one forced token refresh. `authRequired` is set on the context either way. |
| `onRestricted` | `(error: ParsedError) => void` | none | Called when an `authenticatedFetch` response is `402` or `429` with a JSON body. `restriction` is set on the context either way. |

### `InteractionMode` and `ResolvedMode`

| Value | Behaviour |
| --- | --- |
| `'popup'` | Login and card entry open in a centered popup; the flow completes without leaving the page. |
| `'redirect'` | Full-page redirects; `useCheckout` persists the pending flow and resumes it when the user returns. |
| `'auto'` | `'redirect'` when the user agent looks mobile (Android, iPhone, iPad, iPod, Mobile, Silk, Kindle, BlackBerry, Opera Mini) or when `navigator` is unavailable (SSR); `'popup'` otherwise. |

The context exposes the resolved value (`ResolvedMode`, `'popup' | 'redirect'`)
as `useAuth().interactionMode`. Even in popup mode, a blocked popup falls back to
a redirect.

### `BrandingConfig`

Shared by `AuthButton`, `AuthModal`, `ModernAuthForm`, `HyperyModals`,
`BuyButton` and `SubscribeButton` (the `branding` prop).

| Field | Type | Description |
| --- | --- | --- |
| `logo` | `string` | Logo image URL (auth dialogs/forms). |
| `appName` | `string` | App name used in auth copy ("Sign in to {appName}"). |
| `primaryColor` | `string` | Hex color. Auth forms default to `#8b5cf6`; the checkout buttons use it as their background. |

## Context value (`AuthContextValue`)

Returned by [`useAuth()` / `useHyperyAuth()`](./HOOKS.md#useauth--usehyperyauth).

| Field | Type | Description |
| --- | --- | --- |
| `user` | `User \| null` | Signed-in user `{ id, email, name, image? }`. |
| `isAuthenticated` | `boolean` | `!!user`. |
| `isLoading` | `boolean` | True while the session / callback is being resolved. |
| `error` | `string \| null` | Last auth error message. |
| `isLoggingOut` | `boolean \| undefined` | True from `logout()` until the page reloads. |
| `login` | `(options?: LoginOptions) => Promise<void>` | Redirects to the Hypery authorize page. `options.provider` (`'google' \| 'github'`) skips the hosted login page. After a `logout()` it adds `prompt=select_account` once. |
| `loginPopup` | `(options?: LoginOptions) => Promise<PopupAuthResult>` | Log in via popup. Resolves `{ ok, blocked, cancelled }`. |
| `signUp` | `() => Promise<void>` | Same as `login` but always with `prompt=select_account`. |
| `logout` | `() => Promise<void>` | Revokes the access token (`POST /api/oauth/revoke`), clears storage, then `window.location.replace('/')`. |
| `refreshAuth` | `() => Promise<void>` | Reloads the user from the gateway. |
| `getAccessToken` | `(forceRefresh?: boolean) => Promise<string \| null>` | Valid access token, refreshing when expired or forced. Concurrent refreshes share one request. On refresh failure storage is cleared and it returns `null`. |
| `authenticatedFetch` | `(input, init?) => Promise<Response>` | `fetch` with the bearer token. `401` triggers one forced refresh and retry, then sets `authRequired`; `402`/`429` sets `restriction`. Always returns the `Response`. |
| `restriction` | `ParsedError \| null` | Last billing restriction from `authenticatedFetch`. |
| `clearRestriction` | `() => void` | Clears `restriction`. |
| `authRequired` | `boolean` | True when a `401` survived the refresh retry. |
| `clearAuthRequired` | `() => void` | Clears `authRequired`. |
| `interactionMode` | `ResolvedMode` | Resolved `config.interactionMode`. |
| `clientId` / `gatewayUrl` / `redirectUri` | `string` | Echo of the config. |

### `PopupAuthResult`

| Field | Type | Meaning |
| --- | --- | --- |
| `ok` | `boolean` | Signed in. |
| `blocked` | `boolean` | Browser blocked the popup; fall back to `login()`. |
| `cancelled` | `boolean` | Popup closed without completing (also returned when the code exchange fails). |

## Storage keys

For reference, the SDK writes these keys to the configured storage:
`hypery_auth_tokens`, `hypery_auth_user`, and during login `hypery_oauth_verifier`
and `hypery_oauth_state` (in `sessionStorage` for `memory` mode). It also uses
`localStorage` for `hypery_force_reauth` (after logout) and
`hypery_pending_checkout` (redirect-mode checkout resume). See
[ADVANCED.md](./ADVANCED.md) for `TokenStorage`.

## Environment variables

The SDK itself does not read env vars for the provider. `useMemberships`,
`useActiveWorkspace`, `WorkspaceSwitcher` and `useWallet` use, in order: an
explicit `gatewayUrl` argument/prop, the provider's `config.gatewayUrl`,
`process.env.NEXT_PUBLIC_GATEWAY_URL`, then a relative URL on your own origin.
The plain `setActiveWorkspace` function skips the provider step (pass
`gatewayUrl` explicitly). A typical `.env.local`:

```env
NEXT_PUBLIC_OAUTH_CLIENT_ID=your_client_id
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/callback
NEXT_PUBLIC_GATEWAY_URL=https://hypery.ai
```
