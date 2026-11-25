import { afterEach, describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HyperyProvider, useHyperyAuth } from '../context.js';
import { useAiConsent } from '../../components/AiConsent.js';
import type { AuthContextValue, HyperyAuthConfig } from '../../types/index.js';

// HyperyProvider with config.aiConsent: an AI request through authenticatedFetch is not sent until the person
// answers; other requests and apps without aiConsent are untouched.

const base: HyperyAuthConfig = { clientId: 'app_1', redirectUri: 'https://app.test/cb', gatewayUrl: 'https://hypery.test', storage: 'memory' };
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function captured(config: HyperyAuthConfig) {
  let auth: AuthContextValue | null = null;
  let consent: ReturnType<typeof useAiConsent> | null = null;
  function Grab({ withConsent }: { withConsent: boolean }) {
    auth = useHyperyAuth();
    if (withConsent) consent = useAiConsent();
    return <p>app</p>;
  }
  const html = renderToStaticMarkup(
    <HyperyProvider config={config}>
      <Grab withConsent={!!config.aiConsent} />
    </HyperyProvider>,
  );
  return { html, auth: auth as unknown as AuthContextValue, consent };
}

function recordFetch() {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  return calls;
}

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('HyperyProvider aiConsent', () => {
  it('renders the app and gives it useAiConsent()', () => {
    const { html, consent } = captured({ ...base, aiConsent: { branding: { appName: 'Acme' } } });
    expect(html).toContain('<p>app</p>');
    expect(consent?.answer).toBeNull();
    expect(typeof consent?.ensureAiConsent).toBe('function');
  });

  it('does not send an AI request before the person answers', async () => {
    const calls = recordFetch();
    const { auth } = captured({ ...base, aiConsent: {} });
    void auth.authenticatedFetch('https://hypery.test/api/v1/chat/completions', { method: 'POST' });
    await tick();
    expect(calls).toEqual([]);
  });

  it('sends other requests as before', async () => {
    const calls = recordFetch();
    const { auth } = captured({ ...base, aiConsent: {} });
    await auth.authenticatedFetch('https://hypery.test/api/v1/models');
    expect(calls).toEqual(['https://hypery.test/api/v1/models']);
  });

  it('leaves apps without aiConsent unchanged', async () => {
    const calls = recordFetch();
    const { auth } = captured(base);
    await auth.authenticatedFetch('https://hypery.test/api/v1/chat/completions', { method: 'POST' });
    expect(calls).toEqual(['https://hypery.test/api/v1/chat/completions']);
  });
});
