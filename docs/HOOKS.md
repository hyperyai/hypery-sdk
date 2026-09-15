# Hooks

All hooks must be called inside [`HyperyProvider`](./PROVIDER.md).

> Back to [README](../README.md) · Checkout hooks (`useCheckout`, `useMarketplace`, `useAppSubscription`): [CHECKOUT.md](./CHECKOUT.md)

Contents: [useAuth / useHyperyAuth](#useauth--usehyperyauth) · [useUser](#useuser) ·
[useMemberships](#usememberships) · [useActiveWorkspace](#useactiveworkspace) ·
[setActiveWorkspace](#setactiveworkspace) · [useWallet](#usewallet) ·
[useBuyerWallet](#usebuyerwallet) · [useError](#useerror)

---

## `useAuth` / `useHyperyAuth`

`useAuth` is an alias of `useHyperyAuth`. Returns the full context value
(`AuthContextValue`); throws if used outside `HyperyProvider`. The full field
table is in [PROVIDER.md](./PROVIDER.md#context-value-authcontextvalue).

```tsx
import { useAuth } from '@hyperyai/sdk';

function Chat() {
  const { isAuthenticated, login, logout, authenticatedFetch, gatewayUrl } = useAuth();

  const send = async (text: string) => {
    const res = await authenticatedFetch(`${gatewayUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: text }] }),
    });
    return res.json();
  };

  return isAuthenticated ? <button onClick={logout}>Sign out</button> : <button onClick={login}>Sign in</button>;
}
```

Manual token use:

```tsx
const { getAccessToken } = useAuth();
const token = await getAccessToken();          // refreshes if expired
const fresh = await getAccessToken(true);      // force a refresh
```

## `useUser`

```tsx
import { useUser } from '@hyperyai/sdk';

const { user, isLoading } = useUser();
```

| Returns | Type |
| --- | --- |
| `user` | `User \| null` (`{ id, email, name, image? }`) |
| `isLoading` | `boolean` |

## `useMemberships`

Every team and workspace the signed-in user belongs to
(`GET {base}/api/auth/list_memberships`). `base` is
`process.env.NEXT_PUBLIC_GATEWAY_URL`, or `''` (a relative request) when unset.
Each workspace gets `isActive` set from `activeWorkspaceId`.

```tsx
import { useMemberships } from '@hyperyai/sdk';

const { data, isLoading, error, reload } = useMemberships();
data?.memberships.map((m) => m.workspaces.map((w) => w.name));
```

| Returns | Type | Description |
| --- | --- | --- |
| `data` | `MembershipsResponse \| null` | `{ activeOrganizationId, activeWorkspaceId, memberships: MembershipEntry[] }`. `null` when signed out. |
| `isLoading` | `boolean` | |
| `error` | `string \| null` | |
| `reload` | `() => Promise<void>` | Refetch. |

Types: `MembershipEntry` `{ team: MembershipTeam; workspaces: MembershipWorkspace[] }`;
`MembershipTeam` `{ id, name, slug, isPersonal, role }`;
`MembershipWorkspace` `{ id, name, slug, isDefault, icon, role, isActive }`;
`role` is `'owner' | 'admin' | 'developer' | 'viewer'`.

## `useActiveWorkspace`

Resolves the active team + workspace from `useMemberships` (it calls that hook
internally, so it makes its own request). Falls back to the personal team's
default workspace when there is no active pointer.

```tsx
import { useActiveWorkspace } from '@hyperyai/sdk';

const { active, isLoading } = useActiveWorkspace();
active?.workspaceName;
```

| Returns | Type |
| --- | --- |
| `active` | `ActiveWorkspace \| null` (`{ teamId, teamName, workspaceId, workspaceName, role }`) |
| `isLoading` | `boolean` |

## `setActiveWorkspace`

Plain async function (not a hook). Persists the active team + workspace on the
OAuth session (`PATCH {base}/api/oauth/session`). Throws when there is no token
or the request fails.

```tsx
import { setActiveWorkspace, useAuth } from '@hyperyai/sdk';

const { getAccessToken, gatewayUrl } = useAuth();
await setActiveWorkspace({ teamId, workspaceId, getAccessToken, gatewayUrl });
```

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `opts.teamId` | `string` | required | Sent as `activeOrganizationId`. |
| `opts.workspaceId` | `string` | required | Sent as `activeWorkspaceId`. |
| `opts.getAccessToken` | `() => Promise<string \| null>` | required | Usually from `useAuth()`. |
| `opts.gatewayUrl` | `string` | `NEXT_PUBLIC_GATEWAY_URL` or `''` | Base URL. |

Returns `Promise<void>`.

## `useWallet`

Mode-aware AI-credit wallet of the user's team (`GET {base}/api/wallet/state`),
with 1-click funding. Signed out, `wallet` is `null`.

```tsx
import { useWallet } from '@hyperyai/sdk';

const { wallet, addFunds, addPaymentMethod } = useWallet({ gatewayUrl: 'https://hypery.ai' });

if (wallet?.mode === 'prepaid' && wallet.paymentMethod.exists) {
  await addFunds(25);
} else {
  const added = await addPaymentMethod();
}
```

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `opts.gatewayUrl` | `string` | `NEXT_PUBLIC_GATEWAY_URL` or `''` | Base URL. |

| Returns | Type | Description |
| --- | --- | --- |
| `wallet` | `WalletState \| null` | See below. |
| `isLoading` | `boolean` | |
| `error` | `string \| null` | Load error. |
| `reload` | `() => Promise<void>` | Refetch. |
| `addFunds` | `(usd: number) => Promise<void>` | Charges the saved card (`POST /api/wallet/topup`), then reloads. Throws on failure. |
| `addPaymentMethod` | `() => Promise<boolean>` | Opens Stripe-hosted card setup in a popup (`POST /api/payments/stripe/checkout-setup`). Resolves `true` when the popup reports `added`, `false` if it is closed; reloads either way. Throws if the setup session cannot be created. |

`WalletState`: `mode: BillingMode` (`'metered' | 'prepaid'`),
`balance { current, reserved, monthlySpent, monthlyLimit }`,
`paymentMethod { exists, last4?, brand? }`,
`autoTopUp { enabled, threshold?, amount? }`,
`lowBalance { isLow, threshold, current }`,
`topupTiers: WalletTier[]` (`{ name, usdAmount, credits, bonus, popular? }`),
`settingsUrls { billing, topup, addPaymentMethod }`.

## `useBuyerWallet`

The buyer's saved cards for marketplace purchases and subscriptions
(`GET {gatewayUrl}/api/buyer/wallet`, using the provider's `gatewayUrl`).
Fetches on mount.

```tsx
import { useBuyerWallet } from '@hyperyai/sdk';

const { paymentMethods, hasDefault, addCard } = useBuyerWallet();
if (!hasDefault) await addCard({ successUrl: location.href });
```

| Returns | Type | Description |
| --- | --- | --- |
| `paymentMethods` | `BuyerPaymentMethod[]` | `{ id, brand, last4, expMonth, expYear, isDefault }`. |
| `hasDefault` | `boolean` | A default card exists. |
| `isLoading` | `boolean` | |
| `error` | `ParsedError \| null` | Classified load error. |
| `refresh` | `() => Promise<void>` | Refetch. |
| `addCard` | `(opts?: AddCardOptions) => Promise<void>` | Starts Stripe-hosted card entry (`POST /api/buyer/wallet/checkout-setup`) and redirects the browser. Throws if no URL comes back. |

`AddCardOptions`: `successUrl?` and `cancelUrl?`, both defaulting to the current URL.

## `useError`

Local error state that runs everything through
[`parseError`](./ERRORS.md#parseerror).

```tsx
import { useError, RestrictionModal, useAuth } from '@hyperyai/sdk';

const { error, setError, clearError, isBillingRestriction } = useError();
const { gatewayUrl, getAccessToken, clientId } = useAuth();

const res = await fetch(url, init);
if (!res.ok) setError({ ...(await res.json()), status: res.status });

{isBillingRestriction && (
  <RestrictionModal error={error && { ...error.data, code: error.code, message: error.message }}
    clientId={clientId} gatewayUrl={gatewayUrl} getAccessToken={getAccessToken} onClose={clearError} />
)}
```

| Returns | Type | Description |
| --- | --- | --- |
| `error` | `ParsedError \| null` | Parsed error. |
| `setError` | `(error: any) => void` | Parses and stores; a falsy value clears. |
| `clearError` | `() => void` | |
| `hasError` | `boolean` | |
| `isSpendingLimit` | `boolean` | |
| `isInsufficientCredits` | `boolean` | |
| `isPaymentMethodRequired` | `boolean` | |
| `isPaymentDeclined` | `boolean` | |
| `isAuth` | `boolean` | Authentication failure. |
| `isBillingRestriction` | `boolean` | Any of the four billing flags. |

The return type is exported as `UseErrorReturn`.
