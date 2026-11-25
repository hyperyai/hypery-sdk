// AI consent in an app that calls Hypery from the browser through HyperyProvider.
//
// `config.aiConsent` asks once when a signed-in person first opens the app, and every Hypery AI request made with
// `authenticatedFetch` waits for a yes: the person is asked if they haven't answered, and after a no the request
// throws `AiConsentDeclined` without sending anything.

import { useState } from 'react'
import { AiConsentDeclined, HyperyProvider, useAiConsent, useHyperyAuth } from '../../src'

export function App() {
  return (
    <HyperyProvider
      config={{
        clientId: 'your-client-id',
        redirectUri: 'https://acme.app/callback',
        gatewayUrl: 'https://hypery.ai',
        aiConsent: {
          branding: { appName: 'Acme' },
          dataSent: ['What you ask Acme’s assistant, and its replies', 'The notes it reads to answer'],
          privacyPolicyUrl: 'https://acme.app/privacy',
        },
      }}
    >
      <Summarize />
      <AiSetting />
    </HyperyProvider>
  )
}

/** An AI action: waits for the person's answer instead of failing, and says so when AI is off. */
function Summarize() {
  const { authenticatedFetch } = useHyperyAuth()
  const [result, setResult] = useState<string | null>(null)
  const run = async () => {
    try {
      const res = await authenticatedFetch('https://hypery.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'anthropic/claude-sonnet-4', messages: [{ role: 'user', content: 'Summarize my notes' }] }),
      })
      const body = await res.json()
      setResult(body.choices?.[0]?.message?.content ?? null)
    } catch (e) {
      if (e instanceof AiConsentDeclined) setResult('AI is off. Turn it on in Settings to use the assistant.')
      else throw e
    }
  }
  return (
    <section>
      <button onClick={() => void run()}>Summarize</button>
      {result && <p>{result}</p>}
    </section>
  )
}

/** Settings: the person's answer, changeable any time. */
function AiSetting() {
  const { answer, setAnswer } = useAiConsent()
  return (
    <label>
      <input type="checkbox" checked={answer === true} onChange={(e) => void setAnswer(e.target.checked)} />
      Allow AI to use my content
    </label>
  )
}
