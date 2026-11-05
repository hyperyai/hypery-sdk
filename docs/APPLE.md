# Sign in with Apple in App Store builds

App Review rejects an iOS or Mac App Store build that offers Sign in with Apple and
finishes it on a web page (guideline 4): *"Authentication with Sign in with Apple
should always be completed without leaving the app."* Hypery's hosted sign-in page
offers Apple, so an App Store build that signs in through it can be rejected, even
inside an `ASWebAuthenticationSession` sheet.

The SDK fixes this without per-app auth code. The app shows **Apple's own sheet**, and
Hypery turns its identity token into an ordinary sign-in for your app:

- `signInWithAppleNative()` runs the flow (nonce, PKCE, Hypery, two-factor, tokens).
- `NativeSignInDialog` is the dialog: **Sign in with Apple** or **Other sign-in methods**.
- `hideProviders: ['apple']` leaves Apple off the hosted page those other methods open.

> Back to [README](../README.md) · Reference: [`signInWithAppleNative`](./ADVANCED.md#signinwithapplenative) ·
> [`NativeSignInDialog`](./COMPONENTS.md#nativesignindialog)

Contents: [How it works](#how-it-works) · [Setup](#setup) · [The native bridge](#the-native-bridge) ·
[Wiring it up](#wiring-it-up) · [Accounts and two-factor](#accounts-and-two-factor) ·
[Errors](#errors) · [Troubleshooting](#troubleshooting)

## How it works

1. Your app opens `NativeSignInDialog`. The person taps **Sign in with Apple**.
2. The SDK makes a random nonce and calls your `requestCredential` with its SHA-256
   (hex). Your native code shows `ASAuthorizationController` with that nonce and
   answers with Apple's identity token.
3. The SDK posts the token, the raw nonce and a PKCE challenge to Hypery's
   `POST /api/oauth/apple-native`. Hypery checks Apple's signature, that the token was
   issued for **one of your app's bundle ids**, and that its nonce matches.
4. Hypery finds or creates the account and answers with an authorization code, or a
   two-factor ticket (the dialog then asks for the code).
5. The SDK exchanges the code at `/api/oauth/token` with the PKCE verifier, like any
   Hypery sign-in, and gives you the tokens.

Nothing here is a global Hypery setting: each app's tokens are checked against that
app's own bundle ids, so a token minted for one app can't sign anyone in to another.

## Setup

Once per app:

1. **Apple Developer portal.** Certificates, Identifiers & Profiles → Identifiers →
   your App ID → tick **Sign in with Apple** → Save. Regenerate the App Store (and
   development) provisioning profiles afterwards: the old ones become *Invalid*.
2. **Entitlement.** Add to the build's entitlements (iOS, and the Mac App Store
   build's sandboxed entitlements):

   ```xml
   <key>com.apple.developer.applesignin</key>
   <array>
     <string>Default</string>
   </array>
   ```

3. **Hypery: your app's bundle ids.** Hypery accepts a token only for bundle ids
   registered for your app (the same App Store config In-App Purchase uses). As the app's
   owner:

   ```http
   PUT https://hypery.ai/api/apps/{appId}/apple
   Authorization: Bearer {owner token with the write scope}
   Content-Type: application/json

   { "bundleIds": ["com.example.app"], "products": [] }
   ```

   (`GET` the same URL first if you already sell In-App Purchases, and send your
   `products` back unchanged: `PUT` replaces the config.)
4. **Redirect URI.** `signInWithAppleNative` binds the code to a `redirectUri` that
   must be registered for your OAuth client, as for any sign-in (e.g. your app's
   `myapp://auth/callback`). Nothing is redirected to it.

## The native bridge

`requestCredential` is the one native piece: a function `(nonce) => Promise<AppleCredential>`
(type `RequestAppleCredential`). It must:

- set the request's `nonce` to the string it's given, **as given** (it's already hashed);
- request the `fullName` and `email` scopes (Apple shares them on the first sign-in only);
- answer:

| Outcome | Answer |
| --- | --- |
| Signed in | `{ identityToken, givenName?, familyName? }` (the token as a UTF-8 string) |
| The person closed the sheet (`ASAuthorizationError.canceled`) | `{ cancelled: true }` |
| Apple refused at once (`ASAuthorizationError.unknown`, code 1000: the App ID lacks the capability) | `{ unavailable: true }` |
| Anything else | throw, or `{}` |

Swift (iOS and macOS), the shape used by PopCraft's Tauri shell:

```swift
import AuthenticationServices

final class AppleSignIn: NSObject, ASAuthorizationControllerDelegate,
                         ASAuthorizationControllerPresentationContextProviding {
  private let reply: ([String: Any]) -> Void
  init(reply: @escaping ([String: Any]) -> Void) { self.reply = reply }

  func start(nonce: String) {
    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = [.fullName, .email]
    request.nonce = nonce // already SHA-256 hashed by the SDK
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    // Your key window (NSWindow on macOS, UIWindow on iOS).
  }

  func authorizationController(controller: ASAuthorizationController,
                               didCompleteWithAuthorization authorization: ASAuthorization) {
    guard let c = authorization.credential as? ASAuthorizationAppleIDCredential,
          let data = c.identityToken, let token = String(data: data, encoding: .utf8)
    else { return reply(["error": "No identity token"]) }
    var answer: [String: Any] = ["identityToken": token]
    if let g = c.fullName?.givenName { answer["givenName"] = g }
    if let f = c.fullName?.familyName { answer["familyName"] = f }
    reply(answer)
  }

  func authorizationController(controller: ASAuthorizationController,
                               didCompleteWithError error: Error) {
    switch (error as? ASAuthorizationError)?.code {
    case .canceled?: reply(["cancelled": true])
    case .unknown?:  reply(["unavailable": true]) // no Sign in with Apple capability
    default:         reply(["error": error.localizedDescription])
    }
  }
}
```

Keep a strong reference to the `AppleSignIn` object until it replies:
`ASAuthorizationController` holds its delegate weakly.

From the web side the bridge is then one call, e.g. a Tauri command:

```ts
import type { AppleCredential } from '@hyperyai/sdk';
import { invoke } from '@tauri-apps/api/core';

const requestCredential = (nonce: string) => invoke<AppleCredential>('apple_signin_start', { nonce });
```

Any other shell works the same way (Capacitor, React Native, a WKWebView message
handler): call native code with the nonce and map its answer to `AppleCredential`.

## Wiring it up

Show the dialog only in App Store builds, where you have the bridge; elsewhere keep
your usual sign-in. Leave Apple off the hosted page that **Other sign-in methods** opens.

```tsx
import {
  NativeSignInDialog,
  signInWithAppleNative,
  TokenStorage,
  useHyperyAuth,
} from '@hyperyai/sdk';
import '@hyperyai/sdk/styles.css';

function SignInButton({ isAppStoreBuild }: { isAppStoreBuild: boolean }) {
  const { login, refreshAuth } = useHyperyAuth();
  const [open, setOpen] = useState(false);

  if (!isAppStoreBuild) return <button onClick={() => login()}>Sign in</button>;
  return (
    <>
      <button onClick={() => setOpen(true)}>Sign in</button>
      <NativeSignInDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        signInWithApple={() =>
          signInWithAppleNative({
            clientId: CLIENT_ID,
            gatewayUrl: 'https://hypery.ai',
            scopes: ['read', 'ai:chat'],
            redirectUri: 'myapp://auth/callback',
            requestCredential,
          })
        }
        onSignedIn={async (tokens) => {
          new TokenStorage('localStorage').saveTokens(tokens);
          await refreshAuth();
        }}
        onOtherMethods={() => login({ hideProviders: ['apple'] })}
        branding={{ appName: 'My App' }}
      />
    </>
  );
}
```

- `onOtherMethods` should resolve once signed in (or throw to show an error). A
  redirect such as `login()` simply navigates away.
- Build your own sign-in URL with `getAuthorizationUrl({ ..., hideProviders: ['apple'] })`
  when your app signs in through a native web-auth sheet instead.
- **Stacking.** The dialog sits at `z-index: 50`; if your app has higher layers set
  `:root { --hy-z-modal: 10000; }` (see [Styling](../README.md#styling)).
- Without the dialog, call `signInWithAppleNative` from your own UI and handle the
  [errors](#errors) yourself.

## Accounts and two-factor

| The Apple ID… | Result |
| --- | --- |
| is already linked to a Hypery account | Signs in to that account. |
| is new, and its email has no account | Creates an account (email marked verified; Apple's name if shared, else the email's name or "Apple User" for a private relay address). |
| is new, but its email already has an account | Refused with a message to use **Other sign-in methods** (then connect Apple in account settings). It is never linked automatically, which would skip the hosted page's account-takeover and two-factor checks. |

Accounts with **two-factor** finish with their code: Hypery answers with a ticket
(single use, five minutes), the dialog asks for the 6-digit authenticator code or a
backup code, and `POST /api/oauth/apple-native/2fa` checks it with the same replay
protection and rate limits as the hosted page before issuing the code. Without the
dialog, catch `AppleTwoFactorRequired` and call `error.complete(code, 'totp' | 'backup')`.

Banned accounts and accounts scheduled for deletion can't sign in.

## Errors

`signInWithAppleNative` throws:

| Error | Meaning | `NativeSignInDialog` |
| --- | --- | --- |
| `AppleSignInCancelled` | The person closed Apple's sheet. | Back to the choice, no message. |
| `AppleSignInUnavailable` | The app can't show the sheet (no capability). | Runs `onOtherMethods`. Remember it per device so you stop offering Apple. |
| `AppleTwoFactorRequired` | The account uses two-factor. `complete(code, type)` returns the tokens; it throws on a wrong code and can be retried. | Shows the code step. |
| `Error` | Hypery refused, with a message to show. | Shows the message. |

Hypery's answers from `/api/oauth/apple-native` (the `error` field):

| `error` | Status | Cause |
| --- | --- | --- |
| `invalid_request` | 400 | Missing or malformed fields. |
| `invalid_client` | 400 | Unknown `client_id`. |
| `invalid_redirect_uri` | 400 | `redirectUri` isn't registered for the client. |
| `invalid_scope` | 400 | None of the requested scopes are registered for the app. |
| `unauthorized_client` | 400 | The app has no bundle id on Hypery ([Setup](#setup), step 3). |
| `invalid_token` | 401 | Bad signature, expired, wrong bundle id (audience), or nonce mismatch. |
| `email_required` | 400 | Apple shared no email for a new account. |
| `account_exists` | 409 | The email has an account not linked to this Apple ID. |
| `account_unavailable` | 403 | Banned, or scheduled for deletion. |
| — | 202 | `{ two_factor_required: true, ticket }`: finish at `/api/oauth/apple-native/2fa`. |

`/api/oauth/apple-native/2fa` answers `invalid_code` (400, with the attempts left),
`rate_limited` (429) or `expired_ticket` (400: start again with Apple).

## Troubleshooting

- **Apple's sheet never shows; `AppleSignInUnavailable` at once.** The App ID lacks the
  Sign in with Apple capability, or the build lacks the entitlement, or its provisioning
  profile predates the capability (regenerate it).
- **`unauthorized_client`.** Register the bundle id ([Setup](#setup), step 3).
- **`invalid_token` every time.** The bundle id in the token (your build's) isn't one of
  the registered ones, or your native code hashed the nonce again: pass it through as given.
- **The dialog is invisible.** Raise `--hy-z-modal` above your app's layers.
- **App Review still sees Apple on a web page.** Pass `hideProviders: ['apple']` to the
  sign-in that **Other sign-in methods** opens.
