# Asking before AI uses someone's content

Every Hypery AI call (completions, embeddings, images, speech, transcription, realtime) sends the person's content to
an AI model provider. App Review requires an app to say **what is sent**, **who receives it**, and **ask permission
before sending it** (guidelines 5.1.1(i) and 5.1.2(i)), and a line in the Terms or Privacy Policy is not enough. So
asking is part of using Hypery, and the SDK does it:

- `AiConsent` asks once, the first time a signed-in person opens the app, and never again once they answered.
  Closing the dialog counts as **Don't allow**.
- `AiConsentDialog` is the dialog itself: what is sent, who receives it, **Allow** / **Don't allow**.
- Hypery keeps the answer per person per app. After a **Don't allow**, Hypery refuses that app's AI calls for the
  person with `AI_CONSENT_REQUIRED` (HTTP 403). Not having been asked yet is not refused.

> Back to [README](../README.md) · Reference: [`AiConsent`](./COMPONENTS.md#aiconsent) ·
> [Errors](./ERRORS.md)

## Inside `HyperyProvider`

Mount it once anywhere in the signed-in app. It reads and saves the answer with the person's token:

```tsx
import { AiConsent } from '@hyperyai/sdk';

<HyperyProvider config={config}>
  <App />
  <AiConsent
    branding={{ appName: 'Acme' }}
    dataSent={['What you ask Acme’s assistant, and its replies', 'The notes it reads to answer']}
    privacyPolicyUrl="https://acme.app/privacy"
  />
</HyperyProvider>
```

## When the token is on your server

Apps that keep the OAuth token server-side (an httpOnly cookie) proxy the answer through their own route with
`fetchAiConsent` and `saveAiConsent`, and give `AiConsent` a `load` and a `save`:

```ts
// app/api/ai-consent/route.ts
import { fetchAiConsent, saveAiConsent } from '@hyperyai/sdk';

export async function GET() {
  return Response.json(await fetchAiConsent({ gatewayUrl: HYPERY_URL, accessToken: await userToken() }));
}
export async function PUT(req: Request) {
  const { allowed } = await req.json();
  return Response.json(await saveAiConsent({ gatewayUrl: HYPERY_URL, accessToken: await userToken(), allowed }));
}
```

```tsx
<AiConsent
  load={() => fetch('/api/ai-consent').then((r) => r.json())}
  save={(allowed) => fetch('/api/ai-consent', { method: 'PUT', body: JSON.stringify({ allowed }) })}
  branding={{ appName: 'Acme' }}
/>
```

`fetchAiConsent` resolves to an `AiConsentState`: `allowed` (`true`, `false`, or `null` while not asked) and
`recipients`. Both functions take an `AiConsentRequest` (`gatewayUrl`, `accessToken`, optional `fetch`).

## Who receives it

`AI_CONSENT_RECIPIENTS` is what the dialog lists by default (Hypery returns the same list with the answer): Hypery,
the Vercel AI Gateway it routes through, and the maker of the model in use (such as Anthropic, OpenAI or Google).
Pass `recipients` to `AiConsentDialog` only if your app adds its own.

## After "Don't allow"

The person isn't asked again. Hypery refuses the app's AI calls for them with `AI_CONSENT_REQUIRED`;
`isAiConsentRequired` recognises it (a thrown error, a parsed body or a Response-like object), so the app can say
AI is off and where to turn it back on, for example a settings switch that calls `saveAiConsent` with `allowed: true`.
