# AI consent examples

Every Hypery AI call sends the person's content to an AI model provider. App Review (guidelines 5.1.1(i) and
5.1.2(i)) needs the app to say what is sent and who receives it, and to ask before sending. The SDK asks once and
keeps the answer per app and person ([guide](../../docs/AI_CONSENT.md)).

- [`with-provider.tsx`](./with-provider.tsx): the app calls Hypery from the browser. `HyperyProvider`'s
  `aiConsent` asks on start, and `authenticatedFetch` makes each AI request wait for a yes.
- [`server-token.tsx`](./server-token.tsx): the app's server calls Hypery. `AiConsentProvider` asks on start, and
  `ensureAiConsent()` runs in front of each AI action.

`npm run typecheck:examples` checks both.
