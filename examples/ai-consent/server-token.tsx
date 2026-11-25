// AI consent in an app whose server calls Hypery (its OAuth token is in an httpOnly cookie), like Nihmbus.
//
// The page can't put a gate in front of the server's requests, so it asks before it starts AI work: mount
// AiConsentProvider once in the signed-in app (it asks once on start) and call ensureAiConsent() in front of each
// AI action. Nothing reaches the app's AI route, and so nothing reaches Hypery, without a yes.

import { useState } from 'react'
import { AiConsentProvider, useAiConsent } from '../../src'

export function SignedInApp({ user, children }: { user: { id: string }; children: React.ReactNode }) {
  return (
    <AiConsentProvider
      appId="your-client-id"
      userId={user.id}
      branding={{ appName: 'Acme' }}
      dataSent={['What you ask an agent, and its replies', 'The docs and tasks it reads to do the work']}
      privacyPolicyUrl="/legal/privacy"
    >
      {children}
      <AskAgent />
    </AiConsentProvider>
  )
}

function AskAgent() {
  const { ensureAiConsent } = useAiConsent()
  const [note, setNote] = useState<string | null>(null)
  const ask = async (text: string) => {
    // Shows the dialog if the person hasn't said yes yet, and waits for them.
    if (!(await ensureAiConsent())) return setNote('AI is off. Turn it on in Settings to ask the agent.')
    await fetch('/api/agent', { method: 'POST', body: JSON.stringify({ text }) })
  }
  return (
    <section>
      <button onClick={() => void ask('Plan the launch')}>Ask the agent</button>
      {note && <p>{note}</p>}
    </section>
  )
}
