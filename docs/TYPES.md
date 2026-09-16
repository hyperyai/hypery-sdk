# Type reference

Every type exported from `@hyperyai/sdk`, grouped, one line each. Import with
`import type { ... } from '@hyperyai/sdk'`.

> Back to [README](../README.md)

## Provider and auth

| Type | Description | Details |
| --- | --- | --- |
| `HyperyAuthConfig` | `HyperyProvider` `config` prop. | [PROVIDER.md](./PROVIDER.md#hyperyauthconfig) |
| `InteractionMode` | `'auto' \| 'popup' \| 'redirect'`. | [PROVIDER.md](./PROVIDER.md#interactionmode-and-resolvedmode) |
| `ResolvedMode` | `'popup' \| 'redirect'` after resolving `auto`. | [PROVIDER.md](./PROVIDER.md#interactionmode-and-resolvedmode) |
| `BrandingConfig` | `{ logo?, appName?, primaryColor? }`. | [PROVIDER.md](./PROVIDER.md#brandingconfig) |
| `AuthContextValue` | Value returned by `useAuth()` / `useHyperyAuth()`. | [PROVIDER.md](./PROVIDER.md#context-value-authcontextvalue) |
| `AuthState` | `{ user, isAuthenticated, isLoading, error, isLoggingOut? }` (base of `AuthContextValue`). | [PROVIDER.md](./PROVIDER.md#context-value-authcontextvalue) |
| `PopupAuthResult` | `{ ok, blocked, cancelled }` from `loginPopup()`. | [PROVIDER.md](./PROVIDER.md#popupauthresult) |
| `LoginOptions` | `{ provider?: 'google' \| 'github' }` for `login()` / `loginPopup()`. | [PROVIDER.md](./PROVIDER.md#context-value-authcontextvalue) |
| `User` | `{ id, email, name, image? }`. | [HOOKS.md](./HOOKS.md#useuser) |
| `AuthTokens` | `{ accessToken, refreshToken, expiresIn, tokenType }`. | [ADVANCED.md](./ADVANCED.md) |

## Component props

| Type | Component | Details |
| --- | --- | --- |
| `AuthButtonProps` | `AuthButton` | [COMPONENTS.md](./COMPONENTS.md#authbutton) |
| `AuthModalProps` | `AuthModal` | [COMPONENTS.md](./COMPONENTS.md#authmodal) |
| `ModernAuthFormProps` | `ModernAuthForm` | [COMPONENTS.md](./COMPONENTS.md#modernauthform) |
| `WorkspaceSwitcherProps` | `WorkspaceSwitcher` | [COMPONENTS.md](./COMPONENTS.md#workspaceswitcher) |
| `BuyButtonProps` | `BuyButton` | [CHECKOUT.md](./CHECKOUT.md#buybutton) |
| `SubscribeButtonProps` | `SubscribeButton` | [CHECKOUT.md](./CHECKOUT.md#subscribebutton) |
| `HyperyModalsProps` | `HyperyModals` | [ERRORS.md](./ERRORS.md#hyperymodals) |
| `SpendingLimitAlertProps` | `SpendingLimitAlert` | [ERRORS.md](./ERRORS.md#spendinglimitalert) |
| `InsufficientCreditsAlertProps` | `InsufficientCreditsAlert` | [ERRORS.md](./ERRORS.md#insufficientcreditsalert) |
| `ErrorBoundaryProps` | `ErrorBoundary` | [ERRORS.md](./ERRORS.md#errorboundary) |
| `RestrictionError` | `RestrictionModal` `error` prop (flat error object). | [ERRORS.md](./ERRORS.md#restrictionmodal) |

## Workspaces

| Type | Description | Details |
| --- | --- | --- |
| `MembershipsResponse` | `{ activeOrganizationId, activeWorkspaceId, memberships }`. | [HOOKS.md](./HOOKS.md#usememberships) |
| `MembershipEntry` | `{ team, workspaces }`. | [HOOKS.md](./HOOKS.md#usememberships) |
| `MembershipTeam` | `{ id, name, slug, isPersonal, role }`. | [HOOKS.md](./HOOKS.md#usememberships) |
| `MembershipWorkspace` | `{ id, name, slug, isDefault, icon, role, isActive }`. | [HOOKS.md](./HOOKS.md#usememberships) |
| `ActiveWorkspace` | `{ teamId, teamName, workspaceId, workspaceName, role }`. | [HOOKS.md](./HOOKS.md#useactiveworkspace) |

## Wallets

| Type | Description | Details |
| --- | --- | --- |
| `BillingMode` | `'metered' \| 'prepaid' \| 'vag_passthrough'`. | [HOOKS.md](./HOOKS.md#usewallet) |
| `WalletState` | Snapshot from `GET /api/wallet/state`. | [HOOKS.md](./HOOKS.md#usewallet) |
| `WalletTier` | `{ name, usdAmount, credits, bonus, popular? }`. | [HOOKS.md](./HOOKS.md#usewallet) |
| `UseWalletReturn` | Return of `useWallet`. | [HOOKS.md](./HOOKS.md#usewallet) |
| `BuyerPaymentMethod` | `{ id, brand, last4, expMonth, expYear, isDefault }`. | [HOOKS.md](./HOOKS.md#usebuyerwallet) |
| `AddCardOptions` | `{ successUrl?, cancelUrl? }`. | [HOOKS.md](./HOOKS.md#usebuyerwallet) |
| `UseBuyerWalletReturn` | Return of `useBuyerWallet`. | [HOOKS.md](./HOOKS.md#usebuyerwallet) |

## Checkout and marketplace

| Type | Description | Details |
| --- | --- | --- |
| `CheckoutInput` | `purchase` / `topup` / `subscription` union (`subscription` accepts `teamId?`). | [CHECKOUT.md](./CHECKOUT.md#usecheckout) |
| `SubscribeSessionResult` | Authoritative hosted subscribe session outcome (`status`, `state`, `team`, `subscription`). | [CHECKOUT.md](./CHECKOUT.md#subscriptions-hosted-subscribe-page) |
| `CheckoutStatus` | Flow status string union. | [CHECKOUT.md](./CHECKOUT.md#usecheckout) |
| `CheckoutResult` | `{ status, data?, error? }`. | [CHECKOUT.md](./CHECKOUT.md#usecheckout) |
| `UseCheckoutReturn` | Return of `useCheckout`. | [CHECKOUT.md](./CHECKOUT.md#usecheckout) |
| `BuyInput` | Input of `useMarketplace().buy`. | [CHECKOUT.md](./CHECKOUT.md#usemarketplace) |
| `BuySuccess` | `{ ok: true, paymentIntentId, status, amountCents, applicationFeeCents }`. | [CHECKOUT.md](./CHECKOUT.md#usemarketplace) |
| `BuyFailure` | `{ ok: false, error, needsPaymentMethod, needsAuth }`. | [CHECKOUT.md](./CHECKOUT.md#usemarketplace) |
| `BuyResult` | `BuySuccess \| BuyFailure`. | [CHECKOUT.md](./CHECKOUT.md#usemarketplace) |
| `UseMarketplaceReturn` | Return of `useMarketplace`. | [CHECKOUT.md](./CHECKOUT.md#usemarketplace) |

## Subscriptions

| Type | Description | Details |
| --- | --- | --- |
| `PlanInterval` | `'month' \| 'year'`. | [CHECKOUT.md](./CHECKOUT.md#useappsubscription) |
| `AppPlan` | A plan of your app. | [CHECKOUT.md](./CHECKOUT.md#useappsubscription) |
| `AppPlanPrice` | `{ interval, priceCents }`. | [CHECKOUT.md](./CHECKOUT.md#useappsubscription) |
| `AppPlanGrant` | Credit grant configured on a plan. | [CHECKOUT.md](./CHECKOUT.md#useappsubscription) |
| `AppSubscription` | A user's subscription with grant balances and owning `team: { id, name, slug } \| null`. | [CHECKOUT.md](./CHECKOUT.md#useappsubscription) |
| `AppSubscriptionGrantBalance` | `{ type, amountUsd, remainingUsd, expiresAt }`. | [CHECKOUT.md](./CHECKOUT.md#useappsubscription) |
| `SwitchIntervalResult` | Result of `switchInterval`. | [CHECKOUT.md](./CHECKOUT.md#useappsubscription) |
| `UseAppSubscriptionOptions` | `{ teamId?: string }` for `useAppSubscription`. | [CHECKOUT.md](./CHECKOUT.md#useappsubscription) |
| `UseAppSubscriptionReturn` | Return of `useAppSubscription`. | [CHECKOUT.md](./CHECKOUT.md#useappsubscription) |

## Errors

| Type | Description | Details |
| --- | --- | --- |
| `ParsedError` | Normalized, classified error. | [ERRORS.md](./ERRORS.md#parseerror) |
| `ErrorData` | Union of the error payloads below. | [ERRORS.md](./ERRORS.md#error-codes) |
| `ErrorResponse` | `{ error: ErrorData }` envelope. | [ERRORS.md](./ERRORS.md#error-codes) |
| `SpendingLimitErrorData` | `SPENDING_LIMIT_EXCEEDED` payload. | [ERRORS.md](./ERRORS.md#error-codes) |
| `InsufficientCreditsErrorData` | `INSUFFICIENT_CREDITS` payload. | [ERRORS.md](./ERRORS.md#error-codes) |
| `PaymentMethodRequiredErrorData` | `PAYMENT_METHOD_REQUIRED` payload. | [ERRORS.md](./ERRORS.md#error-codes) |
| `PaymentDeclinedErrorData` | `PAYMENT_DECLINED` payload. | [ERRORS.md](./ERRORS.md#error-codes) |
| `AuthenticationErrorData` | `UNAUTHENTICATED` payload. | [ERRORS.md](./ERRORS.md#error-codes) |
| `GenericErrorData` | `{ code, message, type?, [key]: any }`. | [ERRORS.md](./ERRORS.md#error-codes) |
| `UseErrorReturn` | Return of `useError`. | [HOOKS.md](./HOOKS.md#useerror) |

## Streaming

| Type | Description | Details |
| --- | --- | --- |
| `SSEEvent` | `{ event?, data }`. | [STREAMING.md](./STREAMING.md#parsesseframe) |
| `SSEStreamHandlers` | `{ onData?, onError?, onDone? }`. | [STREAMING.md](./STREAMING.md#consumessestream) |
