// AI consent in an app whose server calls Hypery (its OAuth token is in an httpOnly cookie), like Nihmbus.
//
// The answer is kept with the person's Hypery account. The page can't reach Hypery with the token, so a small route
// on the app's server passes it through (below), and the page uses appRouteAiConsentStorage() for it. Mount
// AiConsentProvider once in the signed-in app (it asks once, the first time the account is used in this app) and call
// ensureAiConsent() in front of each AI action: nothing reaches the app's AI route, or Hypery, without a yes.

import { useState } from 'react'
import { AiConsentProvider, appRouteAiConsentStorage, fetchAiConsent, saveAiConsent, useAiConsent } from '../../src'

const storage = appRouteAiConsentStorage('/api/ai-consent')

export function SignedInApp({ user, children }: { user: { id: string }; children: React.ReactNode }) {
  return (
    <AiConsentProvider
      userId={user.id}
      storage={storage}
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

// ---- On the server: app/api/ai-consent/route.ts (Next.js), passing the answer to the person's Hypery account ----

declare function hyperyTokenFromCookie(request: Request): Promise<string | null>

const HYPERY_URL = 'https://hypery.ai'

export async function GET(request: Request) {
  const accessToken = await hyperyTokenFromCookie(request)
  if (!accessToken) return Response.json({ error: 'Sign in first' }, { status: 401 })
  return Response.json({ allowed: await fetchAiConsent({ gatewayUrl: HYPERY_URL, accessToken }) })
}

export async function PUT(request: Request) {
  const accessToken = await hyperyTokenFromCookie(request)
  if (!accessToken) return Response.json({ error: 'Sign in first' }, { status: 401 })
  const { allowed } = (await request.json()) as { allowed: boolean }
  await saveAiConsent({ gatewayUrl: HYPERY_URL, accessToken, allowed })
  return Response.json({ allowed })
}
