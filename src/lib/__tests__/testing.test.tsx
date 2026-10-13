import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HyperyTestProvider } from '../../testing.js';
import { useHyperyAuth } from '../context.js';
import { UserProfile } from '../../components/UserProfile.js';
import { SignedIn, SignedOut } from '../../components/control.js';

const ada = { id: 'u_ada', name: 'Ada Lovelace', email: 'ada@example.com' };

function Probe() {
  const { isAuthenticated, clientId } = useHyperyAuth();
  return <span>{`${isAuthenticated}:${clientId}`}</span>;
}

describe('HyperyTestProvider', () => {
  it('renders signed in with the given user', () => {
    const html = renderToStaticMarkup(
      <HyperyTestProvider user={ada}>
        <Probe />
        <UserProfile />
        <SignedOut>hidden</SignedOut>
      </HyperyTestProvider>,
    );
    expect(html).toContain('true:test-client');
    expect(html).toContain('Ada Lovelace');
    expect(html).not.toContain('hidden');
  });

  it('renders signed out by default, and takes overrides', () => {
    const html = renderToStaticMarkup(
      <HyperyTestProvider clientId="my-app">
        <Probe />
        <SignedIn>hidden</SignedIn>
      </HyperyTestProvider>,
    );
    expect(html).toContain('false:my-app');
    expect(html).not.toContain('hidden');
  });

  it('has resolving no-op methods', async () => {
    let value: ReturnType<typeof useHyperyAuth> | null = null;
    function Grab() {
      value = useHyperyAuth();
      return null;
    }
    renderToStaticMarkup(
      <HyperyTestProvider user={ada}>
        <Grab />
      </HyperyTestProvider>,
    );
    await expect(value!.login()).resolves.toBeUndefined();
    await expect(value!.getAccessToken()).resolves.toBe('test-access-token');
  });
});
