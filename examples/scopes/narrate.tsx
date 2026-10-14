/**
 * Incremental consent: sign in with the basics, ask for `ai:audio` the first
 * time the user presses Play. Already-granted scopes sign in silently; only the
 * new one shows consent. See docs/SCOPES.md.
 */
import { useState } from 'react';
import { HyperyProvider, isInsufficientScopeError, useAuth } from '../../src/index.js';

function Narrate({ text }: { text: string }) {
  const { authenticatedFetch, gatewayUrl, grantedScopes, withScope } = useAuth();
  const [status, setStatus] = useState('');

  async function play() {
    try {
      const res = await withScope('ai:audio', () =>
        authenticatedFetch(`${gatewayUrl}/api/v1/audio/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'tts-1', input: text, voice: 'alloy' }),
        }),
      );
      if (!res.ok) return setStatus(`Speech failed (${res.status})`);
      await new Audio(URL.createObjectURL(await res.blob())).play();
      setStatus('');
    } catch (err) {
      setStatus(isInsufficientScopeError(err) ? 'Audio was not allowed.' : String(err));
    }
  }

  return (
    <p>
      <button onClick={play}>{grantedScopes?.includes('ai:audio') ? 'Play' : 'Allow audio and play'}</button> {status}
    </p>
  );
}

export function App() {
  return (
    <HyperyProvider
      config={{
        clientId: 'your-client-id',
        redirectUri: `${location.origin}/callback`,
        gatewayUrl: 'https://hypery.ai',
        scopes: ['read', 'ai:chat'],
        interactionMode: 'popup',
      }}
    >
      <Narrate text="Hello from Hypery." />
    </HyperyProvider>
  );
}
