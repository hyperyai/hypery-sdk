# Errors and billing restrictions

Hypery returns errors as a JSON envelope. The SDK classifies them into a single
`ParsedError` shape and ships UI to resolve the common cases (add funds, add a
card, re-authenticate).

> Back to [README](../README.md) · Streaming errors: [STREAMING.md](./STREAMING.md) · `useError`: [HOOKS.md](./HOOKS.md#useerror)

Contents: [Error codes](#error-codes) · [parseError](#parseerror) · [Guards](#guards) ·
[formatTimeUntilReset](#formattimeuntilreset) · [HyperyModals](#hyperymodals) ·
[RestrictionModal](#restrictionmodal) · [SpendingLimitAlert](#spendinglimitalert) ·
[InsufficientCreditsAlert](#insufficientcreditsalert) · [ErrorBoundary](#errorboundary)

---

## Error codes

```jsonc
{ "error": { "code": "INSUFFICIENT_CREDITS", "type": "insufficient_credits_error", "message": "...", "available": 10, "required": 50 } }
```

| `code` | Typical status | `ParsedError` flag | Extra data fields |
| --- | --- | --- | --- |
| `SPENDING_LIMIT_EXCEEDED` | 429 | `isSpendingLimit` | `limitType`, `limit`, `current`, `requested`, `resetsAt?` |
| `INSUFFICIENT_CREDITS` | 402 | `isInsufficientCredits` | `available`, `required` |
| `PAYMENT_METHOD_REQUIRED` | 402 | `isPaymentMethodRequired` | none |
| `PAYMENT_DECLINED` | 402 | `isPaymentDeclined` | `reason?` |
| `UNAUTHENTICATED` (or `type: 'authentication_error'`) | 401 | `isAuth` | none |
| `PERMISSION_DENIED`, `INSUFFICIENT_SCOPE` (or `type` `permission_error` / `authorization_error`) | 403 | `isPermissionDenied` | none |
| `RATE_LIMITED` (or `type: 'rate_limit_error'`) | 429 | `isRateLimit` | none |
| `PAYMENT_INCOMPLETE` | 402 | none (checkout: 3-D Secure needed) | `clientSecret`, `stripeAccount` |
| `INTERVAL_NOT_OFFERED` | | none (subscriptions) | |

## `parseError`

`parseError(error: any): ParsedError`

Accepts a parsed JSON body `{ error: { code } }`, an already-unwrapped
`{ code, message }`, a thrown `Error`, or a Response-like object. The HTTP status
is read from `status`, `statusCode` or `response.status`.

When no `code` is found it falls back to the status:
`402` becomes `INSUFFICIENT_CREDITS`, `401` `UNAUTHENTICATED`, `403`
`PERMISSION_DENIED`, `429` `RATE_LIMITED`. Anything else becomes
`UNKNOWN_ERROR` with the error's `message` (or "An unknown error occurred").

```ts
import { parseError } from '@hyperyai/sdk';

const res = await fetch(url, init);
if (!res.ok) {
  const e = parseError({ ...(await res.json()), status: res.status });
  if (e.isInsufficientCredits) openFundsModal();
}
```

`ParsedError` fields: `code`, `message`, `type?`, `status?`, `isSpendingLimit`,
`isInsufficientCredits`, `isPaymentMethodRequired`, `isPaymentDeclined`, `isAuth`,
`isPermissionDenied`, `isRateLimit`, `data: ErrorData` (the unwrapped error object).

## Guards

Each takes `error: any` and returns `boolean` by running `parseError`, so they
accept the same inputs.

| Function | True when |
| --- | --- |
| `isSpendingLimitError` | `isSpendingLimit` |
| `isInsufficientCreditsError` | `isInsufficientCredits` |
| `isPaymentMethodRequiredError` | `isPaymentMethodRequired` |
| `isPaymentDeclinedError` | `isPaymentDeclined` |
| `isAuthError` | `isAuth` |
| `isPermissionDeniedError` | `isPermissionDenied` (do not re-auth for these) |
| `isRateLimitError` | `isRateLimit` |
| `isBillingRestriction` | any of spending limit, insufficient credits, payment method required, payment declined |

```ts
import { isBillingRestriction, isAuthError } from '@hyperyai/sdk';

if (isAuthError(body)) login();
else if (isBillingRestriction(body)) setError(body);
```

## `formatTimeUntilReset`

`formatTimeUntilReset(resetsAt?: string): string`

Formats an ISO timestamp relative to now: `''` when missing, `'soon'` when in the
past, otherwise `'in 3h 12m'` or `'in 12m'`.

---

## `HyperyModals`

Turnkey modal host. Mount once inside `HyperyProvider`. When a request made with
`authenticatedFetch` is blocked, it opens:

- `RestrictionModal` for a `402`/`429` (the context's `restriction`), and
- `AuthModal` for a `401` that survived a token refresh (`authRequired`).

Closing a modal clears the corresponding context state. Requests made with plain
`fetch` do not drive it; use `useError` for those.

```tsx
import { HyperyProvider, HyperyModals, useAuth } from '@hyperyai/sdk';

<HyperyProvider config={config}>
  <App />
  <HyperyModals branding={{ appName: 'Acme' }} onRetry={() => retryLastRequest()} />
</HyperyProvider>
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `branding` | `BrandingConfig` | none | Forwarded to `AuthModal`. |
| `showSocial` | `boolean` | `AuthModal` default (`true`) | Forwarded to `AuthModal`. |
| `showEmailPassword` | `boolean` | `AuthModal` default (`false`) | Forwarded to `AuthModal`. |
| `onRetry` | `() => void` | none | Called by the funds modal's Continue / Try again buttons. |

The props type is exported as `HyperyModalsProps`.

## `RestrictionModal`

Mode-aware funds modal. When `error` is set it loads `GET /api/wallet/state`
and shows:

- spending limit: "Manage spending limits" (opens `settingsUrls.billing` in a new tab) and "Try again";
- metered mode, no card, `PAYMENT_METHOD_REQUIRED` or `PAYMENT_DECLINED`: "Add / Update payment method" (Stripe-hosted setup in a popup);
- prepaid with a card: 1-click "$10 / $25 / $50" top-ups and "Other amount…" (opens `settingsUrls.topup`).

After a successful top-up it shows "You're all set" with a Continue button. Renders nothing when `error` is `null`.

```tsx
import { RestrictionModal, useError, useAuth } from '@hyperyai/sdk';

const { error, clearError } = useError();
const { clientId, gatewayUrl, getAccessToken } = useAuth();

<RestrictionModal
  error={error ? { ...error.data, code: error.code, message: error.message, type: error.type } : null}
  clientId={clientId}
  gatewayUrl={gatewayUrl}
  getAccessToken={getAccessToken}
  onClose={clearError}
  onRetry={retryRequest}
/>
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `error` | `RestrictionError \| null` | required | Flat error object; `null` hides the modal. |
| `gatewayUrl` | `string` | required | Hypery base URL. |
| `getAccessToken` | `() => Promise<string \| null>` | required | Usually from `useAuth()`. |
| `onClose` | `() => void` | required | Close handler. |
| `clientId` | `string` | none | Sent as `X-Hypery-Client-Id`. |
| `appId` | `string` | none | Deprecated alias for `clientId`. |
| `onRetry` | `() => void` | none | Retry the blocked request. |
| `onFunded` | `() => void` | none | Called after funds or a card are added. |
| `className` | `string` | `''` | Dialog classes. |
| `overlayClassName` | `string` | `''` | Overlay classes. |

`RestrictionError`: `{ code, message, type?, limitType?, limit?, current?, requested?, resetsAt?, available?, required?, [key]: any }`.
Note that `RestrictionError` is flat, unlike `ParsedError` (whose details sit in `data`).

## `SpendingLimitAlert`

Inline orange alert for a spending-limit error: message, "{limitType} limit:
current / limit credits used" and the reset time. Renders nothing unless
`error.isSpendingLimit`.

```tsx
import { SpendingLimitAlert, parseError } from '@hyperyai/sdk';

<SpendingLimitAlert error={parseError(body)} onRetry={retry} onUpgradeLimits={() => router.push('/billing')} />
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `error` | `ParsedError` | required | Parsed error. |
| `onRetry` | `() => void` | none | Shows "Try again". |
| `onUpgradeLimits` | `() => void` | none | Shows "Increase limits". |
| `className` | `string` | `''` | Extra classes. |

The props type is exported as `SpendingLimitAlertProps`.

## `InsufficientCreditsAlert`

Inline red alert: message and "You have X credits, but need Y credits". Renders
nothing unless `error.isInsufficientCredits`.

```tsx
<InsufficientCreditsAlert error={parseError(body)} onAddCredits={() => setFundsOpen(true)} />
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `error` | `ParsedError` | required | Parsed error. |
| `onAddCredits` | `() => void` | none | Shows "Add credits". |
| `className` | `string` | `''` | Extra classes. |

The props type is exported as `InsufficientCreditsAlertProps`.

## `ErrorBoundary`

Picks the right inline alert for an error value. Despite the name it is not a
React error boundary: it does not catch render errors. With no `error` it
renders `children`; otherwise `SpendingLimitAlert`, `InsufficientCreditsAlert`
or a generic gray alert with the message.

```tsx
import { ErrorBoundary } from '@hyperyai/sdk';

<ErrorBoundary error={lastError} onRetry={retry} onAddCredits={openFunds}>
  <Result />
</ErrorBoundary>
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `error` | `any` | required | Any value `parseError` accepts; falsy renders `children`. |
| `onRetry` | `() => void` | none | Retry (spending-limit and generic alerts). |
| `onUpgradeLimits` | `() => void` | none | Spending-limit alert. |
| `onAddCredits` | `() => void` | none | Insufficient-credits alert. |
| `className` | `string` | `''` | Extra classes. |
| `children` | `ReactNode` | none | Rendered when there is no error. |

The props type is exported as `ErrorBoundaryProps`.
