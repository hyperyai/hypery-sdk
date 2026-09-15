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

Purchases and subscriptions get an idempotency key generated once per
`checkout()` call and persisted with the redirect resume, so a resumed charge is
not billed twice.

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

Subscribes the user to one of your app's plans (`kind: 'subscription'`), with the
same two-click confirmation. Never throws.

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
| `interval` | `'month' \| 'year'` | not sent (server defaults to monthly) | Billing interval; also shown as `/mo` or `/yr`. The plan must offer it, otherwise the error is `INTERVAL_NOT_OFFERED`. |
| `label` | `ReactNode` | `Subscribe` + price | Idle label. |
| `requireConfirmation` | `boolean` | `true` | Two-click confirm. |
| `onSuccess` | `(data: any) => void` | none | Gateway response, `{ subscription, alreadySubscribed }`. |
| `onError` | `(error: ParsedError, result: CheckoutResult) => void` | none | Terminal errors. For 3-D Secure, `error.code === 'PAYMENT_INCOMPLETE'` and `result.data.error.clientSecret` / `stripeAccount` can be confirmed with Stripe.js. |
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
| `'subscription'` | `planId: string`, `interval?: PlanInterval`, `idempotencyKey?: string` | `POST /api/marketplace/subscribe` |

| Returns | Type | Description |
| --- | --- | --- |
| `checkout` | `(input: CheckoutInput) => Promise<CheckoutResult>` | Run the flow. |
| `status` | `CheckoutStatus` | `'idle' \| 'authenticating' \| 'charging' \| 'adding-card' \| 'redirecting' \| 'success' \| 'error' \| 'cancelled'`. |
| `isRunning` | `boolean` | True for any status other than `idle`, `success`, `error`, `cancelled`. |
| `error` | `ParsedError \| null` | Last terminal error. |

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
| `subscriptions` | `AppSubscription[]` | All of the user's subscriptions to this app. |
| `activeSubscription` | `AppSubscription \| null` | First with status `active`, `trialing` or `past_due`. |
| `isSubscribed` | `boolean` | `!!activeSubscription`. |
| `remainingCreditUsd` | `number` | Sum of `remainingUsd` over the live subscription's grants. |
| `interval` | `PlanInterval \| null` | Live subscription interval (`'month'` if the gateway omits it), `null` without one. |
| `pendingInterval` | `PlanInterval \| null` | Scheduled switch. |
| `nextGrantAt` | `string \| null` | Next monthly grant. |
| `isLoading` | `boolean` | |
| `error` | `ParsedError \| null` | Last load/action error. |
| `refresh` | `() => Promise<void>` | Refetch both lists. |
| `subscribe` | `(planId, opts?: { idempotencyKey?, interval? }) => Promise<CheckoutResult>` | Runs `useCheckout`; refreshes on success. |
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
