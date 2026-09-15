# Checkout, purchases and subscriptions

Charge users through Hypery: one-off marketplace purchases, AI-credit top-ups,
and recurring subscriptions to your app's plans. Your OAuth client needs the
`billing:charge` scope (add it to `config.scopes`).

> Back to [README](../README.md) · Provider options: [PROVIDER.md](./PROVIDER.md) · Buyer wallet hook: [HOOKS.md](./HOOKS.md#usebuyerwallet)

Contents: [How the flow works](#how-the-flow-works-popup-vs-redirect) ·
[BuyButton](#buybutton) · [SubscribeButton](#subscribebutton) ·
[useCheckout](#usecheckout) · [useMarketplace](#usemarketplace) ·
[useAppSubscription](#useappsubscription) · [planPriceCents](#planpricecents)

---

## How the flow works: popup vs redirect

`useCheckout` (and the two buttons built on it) runs one chain:
log in if needed, charge, add a card if the charge needs one, retry once.
Subscriptions differ after login: they open Hypery's hosted subscribe page
(see [Subscriptions: hosted subscribe page](#subscriptions-hosted-subscribe-page)).

| Step | `popup` mode | `redirect` mode |
| --- | --- | --- |
| Log in | `loginPopup()`; a blocked popup falls back to a redirect; closing it returns `cancelled`. | `login()` redirect. |
| Add card | Stripe-hosted card entry in a popup, then the charge is retried. Blocked or closed popup falls back to a redirect. | Redirect to Stripe-hosted card entry. |
| Resume | Not needed. | The pending checkout is saved in `localStorage` (`hypery_pending_checkout`) and resumed once on the next page load after the user is authenticated (at most 3 attempts). |

The mode comes from `config.interactionMode` (`auto` by default, which picks
redirect on mobile). In popup mode `redirectUri` must be same-origin with your app.

A card is added only when the charge returns `PAYMENT_METHOD_REQUIRED`, or a
`402` other than `PAYMENT_INCOMPLETE` / `PAYMENT_DECLINED`. Those two are
returned as errors because a new card will not fix them.

Purchases get an idempotency key generated once per `checkout()` call and
persisted with the redirect resume, so a resumed charge is not billed twice.

### Subscriptions: hosted subscribe page

Requires a Hypery gateway with hosted subscribe sessions (hyperyai/hypery#193).
After making sure the user is logged in, `kind: 'subscription'`:

1. Creates a session: `POST /api/marketplace/subscribe-sessions` with
   `{ planId, interval?, state }` and a fresh random `state`
   (`crypto.getRandomValues`). Popup mode sends `returnOrigin` = the origin of
   `config.redirectUri`; redirect mode sends `returnUrl` = the current page URL.
   Both must match a redirect URI registered on your OAuth app.
2. Opens the returned `url`. On that page the user picks the **team** that owns
   the subscription, the card and the interval (your `interval` is only the
   preselection).
   - popup (`hypery-subscribe`, 480x760): when the user is already logged in the
     window is opened synchronously in the click (showing "Loading…") and pointed
     at the session once it's created, so popup blockers allow it; it is closed if
     session creation fails. If login comes first, the subscribe popup opens after
     the login popup. Only a `hypery:subscribe` message
     from the gateway origin with the matching `sessionId` and `state` is accepted.
     Closing the popup returns `cancelled`.
   - redirect (or a blocked popup): `{ sessionId, state, input }` is saved in
     `localStorage` (`hypery_pending_subscribe`) and the page navigates away.
     Hypery sends the user back with `?subscribe_session=&state=&subscribe_status=`;
     on that load `useCheckout` checks `state` against storage, removes the params
     with `history.replaceState`, fetches the result, and sets `status` and `lastResult`.
3. Fetches the authoritative outcome,
   `GET /api/marketplace/subscribe-sessions/:id/result` (`SubscribeSessionResult`).
   Only `status: 'completed'` is a success; `cancelled`, `pending` or `expired` give
   `{ status: 'cancelled' }`. A state mismatch is an error with code `STATE_MISMATCH`.

On success `CheckoutResult.data` is `{ subscription: AppSubscription, team: { id, name } }`.

---

## `BuyButton`

A "Buy · $X.XX" button for a one-off marketplace purchase
(`kind: 'purchase'`). The first click arms it ("Confirm · $X.XX" plus Cancel),
the second click charges. Never throws.

```tsx
import { BuyButton } from '@hyperyai/sdk';

<BuyButton
  appId="app_123"
  amountCents={499}
  description="Pro upgrade"
  onSuccess={(r) => console.log('paid', r.paymentIntentId)}
  onError={(e) => toast.error(e.message)}
/>
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `appId` | `string` | required | Seller app the purchase is credited to. |
| `amountCents` | `number` | required | Amount charged, in cents. |
| `description` | `string` | none | Purchase description. |
| `label` | `ReactNode` | `Buy · $X.XX` | Idle label. |
| `requireConfirmation` | `boolean` | `true` | Two-click confirm. `false` charges on one click. |
| `onSuccess` | `(result: BuySuccess) => void` | none | `{ ok: true, paymentIntentId, status, amountCents, applicationFeeCents }`. |
| `onError` | `(error: ParsedError) => void` | none | Terminal errors only. Not called for `redirecting` or `cancelled`. |
| `className` | `string` | `''` | Appended classes. |
| `branding` | `BrandingConfig` | none | `primaryColor` becomes the button background. |

The props type is exported as `BuyButtonProps`.

## `SubscribeButton`

Subscribes the user to one of your app's plans (`kind: 'subscription'`) on
Hypery's hosted subscribe page, with the same two-click confirmation. Never throws.

```tsx
import { SubscribeButton, planPriceCents } from '@hyperyai/sdk';

<SubscribeButton planId={plan.id} priceCents={plan.priceCents} interval="month" />

const yearly = planPriceCents(plan, 'year');
{yearly !== null && <SubscribeButton planId={plan.id} priceCents={yearly} interval="year" />}
```

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `planId` | `string` | required | Plan id from `useAppSubscription().plans`. |
| `priceCents` | `number` | none | Display only; Hypery charges the plan's real price. |
| `interval` | `'month' \| 'year'` | not sent (server defaults to monthly) | Interval preselected on the hosted page (the user can change it); also shown as `/mo` or `/yr`. |
| `label` | `ReactNode` | `Subscribe` + price | Idle label. |
| `requireConfirmation` | `boolean` | `true` | Two-click confirm. |
| `onSuccess` | `(data: any) => void` | none | `{ subscription, team }` from the session result. |
| `onError` | `(error: ParsedError, result: CheckoutResult) => void` | none | Terminal errors (session creation, result fetch, `STATE_MISMATCH`). Card entry and 3-D Secure happen on the hosted page. |
| `className` | `string` | `''` | Appended classes. |
| `branding` | `BrandingConfig` | none | `primaryColor` becomes the button background. |

The props type is exported as `SubscribeButtonProps`.

---

## `useCheckout`

The orchestrator behind both buttons. Use it for custom buttons and AI-credit top-ups.

```tsx
import { useCheckout } from '@hyperyai/sdk';

const { checkout, status, isRunning, error } = useCheckout();

const r = await checkout({ kind: 'topup', usdAmount: 20 });
if (r.status === 'success') refreshBalance();
```

`checkout(input: CheckoutInput): Promise<CheckoutResult>`

`CheckoutInput` is one of:

| `kind` | Fields | Endpoint |
| --- | --- | --- |
| `'purchase'` | `appId: string`, `amountCents: number`, `description?: string`, `idempotencyKey?: string` | `POST /api/marketplace/checkout` |
| `'topup'` | `usdAmount: number` | `POST /api/wallet/topup` |
| `'subscription'` | `planId: string`, `interval?: PlanInterval` (preselection), `idempotencyKey?` (deprecated, ignored) | `POST /api/marketplace/subscribe-sessions` + hosted page |

| Returns | Type | Description |
| --- | --- | --- |
| `checkout` | `(input: CheckoutInput) => Promise<CheckoutResult>` | Run the flow. |
| `status` | `CheckoutStatus` | `'idle' \| 'authenticating' \| 'charging' \| 'adding-card' \| 'subscribing' \| 'redirecting' \| 'success' \| 'error' \| 'cancelled'`. |
| `isRunning` | `boolean` | True for any status other than `idle`, `success`, `error`, `cancelled`. |
| `error` | `ParsedError \| null` | Last terminal error. |
| `lastResult` | `CheckoutResult \| null` | Last finished outcome, including a subscription resolved after a redirect return. |

`CheckoutResult`: `{ status: 'success' | 'error' | 'cancelled' | 'redirecting'; data?: any; error?: ParsedError }`.
On `error` from the gateway, `data` carries the raw response body. A second
`checkout()` call while one is already running resolves `{ status: 'error' }`
with no `error`.

## `useMarketplace`

A lower-level single request to `POST /api/marketplace/checkout` using the
buyer's saved card, with no login or card-entry orchestration. Expected billing
errors come back as a result instead of being thrown.

```tsx
import { useMarketplace, useBuyerWallet } from '@hyperyai/sdk';

const { buy, isBuying, lastError } = useMarketplace();
const { addCard } = useBuyerWallet();

const r = await buy({ appId: 'app_123', amountCents: 499, idempotencyKey: order.id });
if (!r.ok && r.needsPaymentMethod) await addCard();
```

`BuyInput`:

| Field | Type | Description |
| --- | --- | --- |
| `appId` | `string` | Seller app. |
| `amountCents` | `number` | Amount in cents. |
| `description` | `string?` | Description. |
| `paymentMethodId` | `string?` | Specific saved card (`pm_...`); defaults to the buyer's default. |
| `idempotencyKey` | `string?` | Pass a stable value per logical purchase. If omitted a fresh `mkt_...` key is generated per call. |

| Returns | Type | Description |
| --- | --- | --- |
| `buy` | `(input: BuyInput) => Promise<BuyResult>` | Run one checkout. |
| `isBuying` | `boolean` | In flight. |
| `lastError` | `ParsedError \| null` | Last failure. |

`BuyResult = BuySuccess | BuyFailure`.
`BuySuccess`: `{ ok: true, paymentIntentId, status, amountCents, applicationFeeCents }`.
`BuyFailure`: `{ ok: false, error: ParsedError, needsPaymentMethod: boolean, needsAuth: boolean }`.

---

## `useAppSubscription`

The signed-in user's subscription to your app's plans. Loads
`GET /api/marketplace/plans?appId=` and `GET /api/marketplace/subscriptions?appId=`
once auth has loaded (nothing is fetched when signed out).

Plans are created in the Hypery dashboard (your app, then **Plans**). A plan's
price and its credit grants are configured separately; grants can only be spent
inside your app and they expire. Annual subscribers are billed yearly but still
receive grants monthly (`nextGrantAt`).

```tsx
import { useAppSubscription, SubscribeButton } from '@hyperyai/sdk';

function Pricing({ appId }: { appId: string }) {
  const { plans, isSubscribed, activeSubscription, remainingCreditUsd, cancel, switchInterval } =
    useAppSubscription(appId);

  if (isSubscribed) {
    return (
      <div>
        {activeSubscription?.plan?.name} · ${remainingCreditUsd.toFixed(2)} credit left
        <button onClick={() => cancel()}>Cancel</button>
        <button onClick={() => switchInterval(undefined, 'year')}>Switch to yearly</button>
      </div>
    );
  }

  return plans.map((plan) => (
    <SubscribeButton key={plan.id} planId={plan.id} priceCents={plan.priceCents} interval={plan.interval} />
  ));
}
```

| Param | Type | Description |
| --- | --- | --- |
| `appId` | `string` | Your app id. |

| Returns | Type | Description |
| --- | --- | --- |
| `plans` | `AppPlan[]` | Active plans. |
| `subscriptions` | `AppSubscription[]` | The app's subscriptions across all of the user's teams (subscriptions are team-owned). |
| `activeSubscription` | `AppSubscription \| null` | First with status `active`, `trialing` or `past_due`. |
| `isSubscribed` | `boolean` | `!!activeSubscription`. |
| `remainingCreditUsd` | `number` | Sum of `remainingUsd` over the live subscription's grants. |
| `interval` | `PlanInterval \| null` | Live subscription interval (`'month'` if the gateway omits it), `null` without one. |
| `pendingInterval` | `PlanInterval \| null` | Scheduled switch. |
| `nextGrantAt` | `string \| null` | Next monthly grant. |
| `isLoading` | `boolean` | |
| `error` | `ParsedError \| null` | Last load/action error. |
| `refresh` | `() => Promise<void>` | Refetch both lists. |
| `subscribe` | `(planId, opts?: { interval? }) => Promise<CheckoutResult>` | Runs `useCheckout` (hosted subscribe page; `interval` is the preselection); refreshes on success, including after a redirect return. |
| `cancel` | `(subscriptionId?: string) => Promise<boolean>` | Stop renewal at period end. Defaults to the live subscription. |
| `resume` | `(subscriptionId?: string) => Promise<boolean>` | Undo a pending cancellation. |
| `switchInterval` | `(subscriptionId: string \| undefined, interval: PlanInterval) => Promise<SwitchIntervalResult>` | See below. |

`switchInterval` semantics:

```tsx
await switchInterval(undefined, 'year');  // month -> year: charged now (may fail with PAYMENT_DECLINED)
await switchInterval(undefined, 'month'); // year -> month: at period end, pendingInterval === 'month'
await switchInterval(undefined, 'year');  // while that switch is pending: cancels it
```

`SwitchIntervalResult`: `{ success, changed, effective?: 'now' | 'period_end', at?, subscription?, error? }`.
With no subscription to act on it returns `{ success: false, changed: false }`.

Types:

- `PlanInterval`: `'month' | 'year'`.
- `AppPlan`: `{ id, appId, name, description, priceCents, currency, interval, prices?: AppPlanPrice[], grants: AppPlanGrant[] }`. `priceCents`/`interval` are the legacy monthly fields.
- `AppPlanPrice`: `{ interval, priceCents }`.
- `AppPlanGrant`: `{ type: 'hypery' | 'stripe', amountUsd, expiresAfterDays, issueOn: 'each_payment' | 'first_payment_only' }`.
- `AppSubscription`: `{ id, appId, plan, status, cancelAtPeriodEnd, currentPeriodEnd, interval?, pendingInterval?, nextGrantAt?, grants: AppSubscriptionGrantBalance[] }`.
- `AppSubscriptionGrantBalance`: `{ type, amountUsd, remainingUsd, expiresAt }`.
- `UseAppSubscriptionReturn`: the return table above.

## `planPriceCents`

`planPriceCents(plan, interval = 'month'): number | null`

Price of a plan at an interval, in cents. Uses `plan.prices` when present;
otherwise falls back to the legacy `priceCents` when `plan.interval` (default
`'month'`) matches. Returns `null` when the plan does not offer that interval.

```ts
import { planPriceCents } from '@hyperyai/sdk';

planPriceCents({ prices: [{ interval: 'year', priceCents: 9900 }] }, 'year'); // 9900
planPriceCents({ priceCents: 999 }, 'year');                                   // null
```

See the [Subscription Plans API](https://hypery.ai/docs/management-apis/subscription-plans).
