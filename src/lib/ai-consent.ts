/**
 * AI data consent: every Hypery AI call sends the person's content to a model provider, so an app asks once, in the
 * app, before its first one (App Review guidelines 5.1.1(i), 5.1.2(i)). Hypery keeps the answer per person per app
 * (GET/PUT /api/user/ai-consent, with the app's own token) and refuses that app's AI calls with
 * `AI_CONSENT_REQUIRED` only after the person said no.
 *
 * `<AiConsent>` asks for you. These functions work anywhere (browser or server), for an app that keeps the token on
 * its server and proxies the answer through its own route.
 */

import { parseError } from './parse-error.js';

/** The code Hypery's AI routes refuse with once the person declined AI in this app. */
export const AI_CONSENT_REQUIRED = 'AI_CONSENT_REQUIRED';

/** Who receives the content: Hypery, the gateway it routes through, and the model's maker. */
export const AI_CONSENT_RECIPIENTS = [
  'Hypery (hypery.ai), the AI gateway the app uses',
  'Vercel AI Gateway, which passes each request to the model',
  'The AI model’s maker, such as Anthropic, OpenAI or Google',
] as const;

/** The person's answer in this app: true, false, or null while not asked yet. */
export interface AiConsentState {
  allowed: boolean | null;
  recipients: string[];
}

export interface AiConsentRequest {
  /** Hypery's base URL, e.g. `https://hypery.ai`. */
  gatewayUrl: string;
  /** The app's OAuth access token for the person. */
  accessToken: string;
  fetch?: typeof fetch;
}

function endpoint(gatewayUrl: string): string {
  return `${gatewayUrl.replace(/\/$/, '')}/api/user/ai-consent`;
}

async function call(req: AiConsentRequest, init: RequestInit): Promise<AiConsentState> {
  const res = await (req.fetch ?? fetch)(endpoint(req.gatewayUrl), {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${req.accessToken}` },
  });
  const body = (await res.json().catch(() => null)) as { allowed?: unknown; recipients?: unknown; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(body?.error?.message || `AI consent request failed (${res.status})`);
  return {
    allowed: typeof body?.allowed === 'boolean' ? body.allowed : null,
    recipients: Array.isArray(body?.recipients) ? (body!.recipients as string[]) : [...AI_CONSENT_RECIPIENTS],
  };
}

/** Read the person's answer in this app. */
export function fetchAiConsent(req: AiConsentRequest): Promise<AiConsentState> {
  return call(req, { method: 'GET' });
}

/** Save the person's answer in this app. */
export function saveAiConsent(req: AiConsentRequest & { allowed: boolean }): Promise<AiConsentState> {
  return call(req, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allowed: req.allowed }),
  });
}

/** Was this error Hypery refusing an AI call because the person declined AI in this app? */
export function isAiConsentRequired(error: unknown): boolean {
  return parseError(error).code === AI_CONSENT_REQUIRED;
}
