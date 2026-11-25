# Asking before AI uses someone's content

Every Hypery AI call (chat, completions, embeddings, images, audio, realtime) sends the person's content to an AI
model provider. App Review needs the app to say **what is sent** and **who receives it**, and to **ask before
sending** (guidelines 5.1.1(i) and 5.1.2(i)). A line in the Terms or Privacy Policy is not enough. The SDK asks for
you:

- It asks **once**, when a signed-in person first opens the app. Closing the dialog counts as **Don't allow**.
- The answer is kept per app and person (`aiConsentKey`), in localStorage unless you pass your own storage.
- An AI action **waits** for the answer instead of failing. After a **Don't allow**, trying an AI feature asks again.
  If the person still says no, nothing is sent.

> Back to [README](../README.md) · Examples: [examples/ai-consent](../examples/ai-consent/) · Reference:
> [`AiConsentProvider`](./COMPONENTS.md#aiconsentprovider) · [`useAiConsent`](./HOOKS.md#useaiconsent) ·
> [`AiConsentDeclined`](./ERRORS.md#aiconsentdeclined) · [`aiConsent` config](./PROVIDER.md#hyperyauthconfig)

Contents: [How it works](#how-it-works) · [Browser apps](#apps-that-call-hypery-from-the-browser) ·
[Server apps](#apps-whose-server-calls-hypery) · [Who receives it](#who-receives-it) ·
[Keeping the answer](#keeping-the-answer) · [App Review](#app-review) · [Privacy policy](#privacy-policy) ·
[Testing](#testing) · [Building blocks](#building-blocks)

## How it works

1. The person signs in and opens the app. With no answer stored for this app and person, the dialog opens:
   **Allow AI to use your content?**, what is sent, who receives it, and the privacy policy.
2. **Allow** stores `true`. AI requests go ahead from then on, and the dialog doesn't come back.
3. **Don't allow**, or closing the dialog, stores `false`. The app works as usual and nothing goes to an AI provider.
4. Later, when the person tries an AI feature (`ensureAiConsent()`, or an AI request through `authenticatedFetch`),
   the dialog opens again so they can turn AI on. If they say no again, the action resolves `false` or throws
   `AiConsentDeclined`, with nothing sent.

## Apps that call Hypery from the browser

Set `aiConsent` on `HyperyProvider`'s config. Every Hypery AI request made with `authenticatedFetch` waits for a
yes. After a no it throws `AiConsentDeclined`, having sent nothing.

```tsx
<HyperyProvider config={{ ...config, aiConsent: {
  branding: { appName: 'Acme' },
  dataSent: ['What you ask Acme’s assistant, and its replies', 'The notes it reads to answer'],
  privacyPolicyUrl: 'https://acme.app/privacy',
} }}>
  <App />
</HyperyProvider>
```

`isAiRequest` decides which requests need it: Hypery's `/api/v1` chat, completions, responses, embeddings, images,
audio, realtime, predictions and `ai` routes.

## Apps whose server calls Hypery

Mount `AiConsentProvider` once in the signed-in app and call `ensureAiConsent()` from `useAiConsent` in front of
each AI action. It resolves `true` at once when allowed. Otherwise it shows the dialog and resolves with the answer.

```tsx
<AiConsentProvider appId={clientId} userId={user.id} branding={{ appName: 'Acme' }}
  dataSent={['What you ask an agent', 'The docs it reads to do the work']} privacyPolicyUrl="/legal/privacy">
  <App />
</AiConsentProvider>

const { ensureAiConsent } = useAiConsent();
if (await ensureAiConsent()) await fetch('/api/agent', { method: 'POST', body });
```

`AiConsentProviderProps` adds `appId`, `userId`, `storage` (an `AiConsentStorage`) and `askOnStart` (default true) to
the dialog's `AiConsentText` (`dataSent`, `recipients`, `privacyPolicyUrl`, `branding`). `useAiConsent()` returns an
`AiConsentValue`: `answer` (an `AiConsentAnswer`: `true`, `false`, or `null` while not asked), `ensureAiConsent()`, and
`setAnswer(allowed)` for a settings switch.

## Who receives it

`AI_CONSENT_RECIPIENTS` is what the dialog lists by default: Hypery, the Vercel AI Gateway it routes through, and the
maker of the model in use (such as Anthropic, OpenAI or Google). Pass `recipients` only if your app sends to others.

## Keeping the answer

By default the answer is kept in `localStorage` under `aiConsentKey(appId, userId)`
(`hypery_ai_consent:<appId>:<userId>`), so each person is asked once per device. To keep it with the account, so it
follows the person across devices, pass an `AiConsentStorage` that reads and writes your server:

```ts
const serverStorage: AiConsentStorage = {
  get: async () => (await fetch('/api/ai-consent').then((r) => r.json())).allowed ?? null,
  set: async (_key, allowed) => void (await fetch('/api/ai-consent', { method: 'PUT', body: JSON.stringify({ allowed }) })),
};

<AiConsentProvider appId={clientId} userId={user.id} storage={serverStorage}>…</AiConsentProvider>
```

## App Review

Tell App Review where the permission is asked, in the App Review notes and in your reply to a 5.1.1(i) / 5.1.2(i)
rejection. For example:

> After signing in, the app shows "Allow AI to use your content?", which lists what is sent (…) and who receives it:
> Hypery (hypery.ai), our AI gateway, which passes each request to the model's maker (Anthropic, OpenAI or Google).
> Nothing is sent until the person taps Allow. With Don't allow, the app works with AI features off. The choice can
> be changed in Settings › ….

Give the dialog a `dataSent` list that matches what your app really sends.

## Privacy policy

The dialog is what App Review requires in the app. The privacy policy must also say, in its own words, what data the
app sends to AI providers, how it is collected, what it is used for, and who receives it: Hypery and the model
providers it routes to. Link it with `privacyPolicyUrl` so the dialog points to it.

## Testing

- `AiConsentController` is the dialog's logic without React. Drive `load`, `ensure` and `respond` with an in-memory
  `AiConsentStorage` to test your own flows (see `src/lib/__tests__/ai-consent.test.ts`).
- To see the dialog again on a device, clear the answer: `localStorage.removeItem(aiConsentKey(clientId, userId))`, or
  `setAnswer(false)` and then try an AI feature.
- Typecheck the examples with `npm run typecheck:examples`.

## Building blocks

- `AiConsentDialog` (props `AiConsentDialogProps`: `isOpen`, `onAnswer`, plus `AiConsentText`): the dialog alone.
- `AiConsentController`: the asking without React (`load`, `ensure`, `respond`, `set`, and `subscribe`/`getState`
  with an `AiConsentState`). `AiConsentProvider` renders it.
- `localAiConsentStorage`: the default storage. Write your own `AiConsentStorage` to keep the answer on your server.
- `ensureAllowed` (`ensureAllowed(answer, ask)`): the rule for one request (send on yes, ask otherwise, throw `AiConsentDeclined` on
  no), for code that keeps the answer itself.
