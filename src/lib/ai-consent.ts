/**
 * AI data consent. Every Hypery AI call sends the person's content to a third-party model provider, so an app built
 * on Hypery has to say what is sent and who receives it, and get the person's permission, in the app, before the
 * first one (App Review guidelines 5.1.1(i) and 5.1.2(i); a line in the Terms or Privacy Policy is not enough).
 *
 * This is the part without React: where the answer is kept (the person's Hypery account), which requests need it,
 * and the error a declined request ends in. `AiConsentProvider` (components/AiConsent.tsx) asks; `HyperyProvider` waits for it before an AI
 * request when `config.aiConsent` is set.
 */

/** Who receives the content: Hypery, the gateway it routes through, and the model's maker. */
export const AI_CONSENT_RECIPIENTS = [
  'Hypery (hypery.ai), the AI gateway this app uses',
  'Vercel AI Gateway, which passes each request to the model',
  'The AI model’s maker, such as Anthropic, OpenAI or Google',
] as const;

/** The person's answer: true (allowed), false (not allowed) or null (not asked yet). */
export type AiConsentAnswer = boolean | null;

/**
 * Where the answer is kept: with the person's Hypery account, so it follows them across devices and reinstalls.
 * `hyperyAiConsentStorage` (the default inside HyperyProvider) talks to Hypery; `appRouteAiConsentStorage` talks to
 * the app's own route when the app's server holds the token.
 */
export interface AiConsentStorage {
  get(): Promise<AiConsentAnswer>;
  set(allowed: boolean): Promise<void>;
}

/** A request to Hypery's `/api/user/ai-consent`, with the app's OAuth token for the person. */
export interface AiConsentRequest {
  /** Hypery's base URL, e.g. `https://hypery.ai`. */
  gatewayUrl: string;
  accessToken: string;
  fetch?: typeof fetch;
}

async function consentCall(req: AiConsentRequest, init: RequestInit): Promise<AiConsentAnswer> {
  const url = `${req.gatewayUrl.replace(/\/$/, '')}/api/user/ai-consent`;
  const res = await (req.fetch ?? fetch)(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${req.accessToken}` },
  });
  const body = (await res.json().catch(() => null)) as { allowed?: unknown; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(body?.error?.message || `AI consent request failed (${res.status})`);
  return typeof body?.allowed === 'boolean' ? body.allowed : null;
}

/** Read the person's answer for this app from their Hypery account (browser or server). */
export function fetchAiConsent(req: AiConsentRequest): Promise<AiConsentAnswer> {
  return consentCall(req, { method: 'GET' });
}

/** Save the person's answer for this app on their Hypery account (browser or server). */
export async function saveAiConsent(req: AiConsentRequest & { allowed: boolean }): Promise<void> {
  await consentCall(req, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowed: req.allowed }),
  });
}

/** The answer on the person's Hypery account, with a token from `getAccessToken` (HyperyProvider's by default). */
export function hyperyAiConsentStorage(opts: {
  gatewayUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}): AiConsentStorage {
  const request = async (): Promise<AiConsentRequest> => {
    const accessToken = await opts.getAccessToken();
    if (!accessToken) throw new Error('Sign in to keep your AI choice');
    return { gatewayUrl: opts.gatewayUrl, accessToken, fetch: opts.fetch };
  };
  return {
    get: async () => fetchAiConsent(await request()),
    set: async (allowed) => saveAiConsent({ ...(await request()), allowed }),
  };
}

/**
 * The answer through the app's own route, for apps whose server holds the person's Hypery token (an httpOnly cookie).
 * The route answers GET with `{ allowed }` and saves PUT `{ allowed }`, calling `fetchAiConsent` / `saveAiConsent`
 * on the server with the person's token (see docs/AI_CONSENT.md).
 */
export function appRouteAiConsentStorage(path = '/api/ai-consent', opts: { fetch?: typeof fetch } = {}): AiConsentStorage {
  const call = async (init: RequestInit) => {
    const res = await (opts.fetch ?? fetch)(path, { credentials: 'same-origin', ...init });
    const body = (await res.json().catch(() => null)) as { allowed?: unknown; error?: unknown } | null;
    if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : `AI consent request failed (${res.status})`);
    return typeof body?.allowed === 'boolean' ? body.allowed : null;
  };
  return {
    get: () => call({ method: 'GET' }),
    set: async (allowed) => {
      await call({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowed }) });
    },
  };
}

/** Hypery's endpoints that send content to a model provider. */
const AI_PATH = /\/api\/v1\/(chat|completions|responses|embeddings|images|audio|realtime|predictions|ai)(\/|$|\?)/;

/** Does this request send content to an AI provider (so it needs the person's permission)? */
export function isAiRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    return AI_PATH.test(new URL(url, 'http://local').pathname);
  } catch {
    return false;
  }
}

/** Thrown in place of an AI request the person didn't allow. Nothing was sent. */
export class AiConsentDeclined extends Error {
  constructor() {
    super('AI is turned off: you chose not to let this app send your content to AI providers.');
    this.name = 'AiConsentDeclined';
  }
}

/**
 * The decision for one AI request: go ahead when allowed, otherwise ask (`ask` shows the dialog and resolves with
 * the answer) and go ahead only on yes. Never sends anything without a yes.
 */
export async function ensureAllowed(answer: AiConsentAnswer, ask: () => Promise<boolean>): Promise<void> {
  if (answer === true) return;
  if (!(await ask())) throw new AiConsentDeclined();
}

/** What the consent dialog shows: the answer, and whether it is open. */
export interface AiConsentState {
  answer: AiConsentAnswer;
  open: boolean;
}

/**
 * The asking, without React (AiConsentProvider renders it): loads the answer, opens the dialog once when there is
 * none (`askOnStart`), and makes `ensure()` wait for the person's answer. Closing the dialog is answering no.
 */
export class AiConsentController {
  private state: AiConsentState = { answer: null, open: false };
  private waiting: ((allowed: boolean) => void)[] = [];
  private listeners = new Set<() => void>();

  constructor(
    private readonly storage: AiConsentStorage,
    private readonly askOnStart: boolean,
  ) {}

  /** For useSyncExternalStore. */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getState = (): AiConsentState => this.state;

  private update(next: Partial<AiConsentState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  /** Read the stored answer; with none, ask now when `askOnStart`. */
  async load(): Promise<void> {
    const answer = await this.storage.get();
    this.update({ answer, open: this.state.open || (answer === null && this.askOnStart) });
  }

  /** Resolves true at once when allowed; otherwise opens the dialog and resolves with the person's answer. */
  ensure(): Promise<boolean> {
    if (this.state.answer === true) return Promise.resolve(true);
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      this.update({ open: true });
    });
  }

  /** The person answered in the dialog (closing it is `false`). */
  async respond(allowed: boolean): Promise<void> {
    await this.storage.set(allowed);
    const waiting = this.waiting;
    this.waiting = [];
    this.update({ answer: allowed, open: false });
    for (const resolve of waiting) resolve(allowed);
  }

  /** Change the answer outside the dialog (a settings switch). */
  async set(allowed: boolean): Promise<void> {
    await this.storage.set(allowed);
    this.update({ answer: allowed });
  }
}
