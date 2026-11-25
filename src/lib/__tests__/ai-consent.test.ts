import { describe, expect, it } from 'bun:test';
import { AI_CONSENT_RECIPIENTS, fetchAiConsent, isAiConsentRequired, saveAiConsent } from '../ai-consent.js';

const fakeFetch = (status: number, body: unknown, seen: { url?: string; init?: RequestInit }[] = []) =>
  (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

describe('AI data consent', () => {
  it('reads the answer with the app token (null while not asked)', async () => {
    const seen: { url?: string; init?: RequestInit }[] = [];
    const s = await fetchAiConsent({ gatewayUrl: 'https://hypery.test/', accessToken: 'tok', fetch: fakeFetch(200, { allowed: null }, seen) });
    expect(s).toEqual({ allowed: null, recipients: [...AI_CONSENT_RECIPIENTS] });
    expect(seen[0].url).toBe('https://hypery.test/api/user/ai-consent');
    expect((seen[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('saves the answer', async () => {
    const seen: { url?: string; init?: RequestInit }[] = [];
    const s = await saveAiConsent({ gatewayUrl: 'https://hypery.test', accessToken: 'tok', allowed: false, fetch: fakeFetch(200, { allowed: false, recipients: ['X'] }, seen) });
    expect(s).toEqual({ allowed: false, recipients: ['X'] });
    expect(seen[0].init!.method).toBe('PUT');
    expect(JSON.parse(String(seen[0].init!.body))).toEqual({ allowed: false });
  });

  it('throws the server message on failure', async () => {
    await expect(
      fetchAiConsent({ gatewayUrl: 'https://hypery.test', accessToken: 'tok', fetch: fakeFetch(403, { error: { message: 'Call this with the app’s OAuth token' } }) }),
    ).rejects.toThrow(/OAuth token/);
  });

  it('recognises Hypery refusing an AI call after a no', () => {
    expect(isAiConsentRequired({ error: { code: 'AI_CONSENT_REQUIRED', type: 'ai_consent_error', message: 'no' } })).toBe(true);
    expect(isAiConsentRequired({ error: { code: 'PERMISSION_DENIED', message: 'no' } })).toBe(false);
    expect(isAiConsentRequired({ status: 403 })).toBe(false);
  });
});
