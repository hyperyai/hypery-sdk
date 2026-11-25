/**
 * AiConsent Component
 * Mount once in a signed-in app: asks the AI data question (AiConsentDialog) the first time, and never again once
 * the person answered in this app; closing it counts as "Don't allow". Inside <HyperyProvider> it reads and saves the
 * answer with the person's token; an app that keeps the token on its server passes `load` and `save` that go
 * through its own route (fetchAiConsent / saveAiConsent server-side).
 */

'use client';

import React, { useContext, useEffect, useState } from 'react';
import { AiConsentDialog, type AiConsentDialogProps } from './AiConsentDialog.js';
import { AuthContext } from '../lib/context.js';
import { fetchAiConsent, saveAiConsent, type AiConsentState } from '../lib/ai-consent.js';

/** Props of {@link AiConsent}. */
export interface AiConsentProps extends Omit<AiConsentDialogProps, 'isOpen' | 'onAnswer' | 'recipients'> {
  /** Reads the person's answer. Default: Hypery, with the token from <HyperyProvider>. */
  load?: () => Promise<AiConsentState>;
  /** Saves the person's answer. Default: Hypery, with the token from <HyperyProvider>. */
  save?: (allowed: boolean) => Promise<unknown>;
  /** Called after the person answered. */
  onAnswered?: (allowed: boolean) => void;
}

/**
 * @example
 * ```tsx
 * // Inside <HyperyProvider>:
 * <AiConsent branding={{ appName: 'Acme' }} privacyPolicyUrl="https://acme.app/privacy" />
 *
 * // Token on the app's server:
 * <AiConsent
 *   load={() => fetch('/api/ai-consent').then((r) => r.json())}
 *   save={(allowed) => fetch('/api/ai-consent', { method: 'PUT', body: JSON.stringify({ allowed }) })}
 *   branding={{ appName: 'Acme' }}
 * />
 * ```
 */
export function AiConsent({ load, save, onAnswered, ...dialog }: AiConsentProps) {
  // Optional: an app that passes load/save needn't be inside <HyperyProvider>.
  const ctx = useContext(AuthContext);
  const [state, setState] = useState<AiConsentState | null>(null);
  const [open, setOpen] = useState(false);

  const withToken = async () => {
    const accessToken = await ctx?.getAccessToken();
    if (!ctx || !accessToken) throw new Error('Sign in first');
    return { gatewayUrl: ctx.gatewayUrl, accessToken };
  };
  const loader = load ?? (async () => fetchAiConsent(await withToken()));
  const saver = save ?? (async (allowed: boolean) => saveAiConsent({ ...(await withToken()), allowed }));

  useEffect(() => {
    let live = true;
    loader()
      .then((s) => {
        if (!live) return;
        setState(s);
        if (s.allowed === null) setOpen(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // Asked once per mount: a signed-in app mounts this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AiConsentDialog
      {...dialog}
      isOpen={open}
      recipients={state?.recipients}
      onAnswer={async (allowed) => {
        await saver(allowed);
        setState((s) => (s ? { ...s, allowed } : s));
        setOpen(false);
        onAnswered?.(allowed);
      }}
    />
  );
}
