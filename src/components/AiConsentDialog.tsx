/**
 * AiConsentDialog Component
 * Asks before an app sends someone's content to AI model providers through Hypery: what is sent, who receives it,
 * Allow / Don't allow (App Review guidelines 5.1.1(i) and 5.1.2(i)). Every Hypery completion goes to a third-party
 * provider, so this is part of using Hypery, asked once per person and app. Usually mounted through `<AiConsent>`,
 * which loads and saves the answer; use this directly to show it on your own terms.
 */

'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.js';
import { ErrorNote, Spinner, brandStyle, buttonSizes, buttonVariants } from './ui/primitives.js';
import { cn } from '../lib/utils.js';
import { AI_CONSENT_RECIPIENTS } from '../lib/ai-consent.js';

/** Props of {@link AiConsentDialog}. */
export interface AiConsentDialogProps {
  /** Whether the dialog is open. */
  isOpen: boolean;
  /**
   * Saves the answer. The dialog stays open (showing the error) if it throws. Closing the dialog any other way
   * answers `false`, so a person is asked once.
   */
  onAnswer: (allowed: boolean) => Promise<void> | void;
  /**
   * What this app sends, in the person's terms (e.g. "What you ask an agent, and the docs it reads to answer").
   * Defaults to a general description.
   */
  dataSent?: string[];
  /** Who receives it. Defaults to Hypery and the model providers it routes to. */
  recipients?: string[];
  /** The app's privacy policy, linked under the lists. */
  privacyPolicyUrl?: string;
  branding?: { appName?: string; primaryColor?: string };
}

const DEFAULT_DATA_SENT = [
  'What you ask the app’s AI features, and their replies',
  'The content you choose to use with them, such as text, files or recordings',
];

/**
 * @example
 * ```tsx
 * <AiConsentDialog
 *   isOpen={open}
 *   onAnswer={(allowed) => saveAiConsent({ gatewayUrl, accessToken, allowed })}
 *   dataSent={['What you ask an agent', 'The docs and tasks it reads to do that work']}
 *   privacyPolicyUrl="https://acme.app/privacy"
 *   branding={{ appName: 'Acme' }}
 * />
 * ```
 */
export function AiConsentDialog({
  isOpen,
  onAnswer,
  dataSent = DEFAULT_DATA_SENT,
  recipients = [...AI_CONSENT_RECIPIENTS],
  privacyPolicyUrl,
  branding,
}: AiConsentDialogProps) {
  const [busy, setBusy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const appName = branding?.appName || 'This app';

  const answer = async (allowed: boolean) => {
    if (busy !== null) return;
    setBusy(allowed);
    setError(null);
    try {
      await onAnswer(allowed);
    } catch (e) {
      setError((e as Error)?.message || 'Your choice wasn’t saved. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && void answer(false)}>
      <DialogContent className="hy:max-w-[440px] hy:gap-0 hy:p-7" style={brandStyle(branding?.primaryColor)}>
        <DialogHeader>
          <DialogTitle className="hy:text-lg">Allow AI to use your content?</DialogTitle>
          <DialogDescription>
            {appName}’s AI features send your content to AI providers to do the work. Nothing is sent unless you allow
            it.
          </DialogDescription>
        </DialogHeader>
        <div className="hy:mt-5 hy:flex hy:flex-col hy:gap-4 hy:text-sm hy:text-muted-foreground">
          <section>
            <p className="hy:font-medium hy:text-foreground">What is sent</p>
            <ul className="hy:mt-1 hy:list-disc hy:space-y-0.5 hy:ps-5">
              {dataSent.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>
          <section>
            <p className="hy:font-medium hy:text-foreground">Who receives it</p>
            <ul className="hy:mt-1 hy:list-disc hy:space-y-0.5 hy:ps-5">
              {recipients.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="hy:mt-1">They use it only to answer the request.</p>
          </section>
          <p>
            Your name, email and payment details are not sent. If you don’t allow it, the app works as usual with AI
            features turned off
            {privacyPolicyUrl ? (
              <>
                {' '}
                (
                <a href={privacyPolicyUrl} target="_blank" rel="noreferrer" className="hy:underline">
                  Privacy Policy
                </a>
                )
              </>
            ) : null}
            .
          </p>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="hy:flex hy:flex-col-reverse hy:gap-2 hy:sm:flex-row hy:sm:justify-end">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void answer(false)}
              className={cn(buttonVariants.ghost, buttonSizes.lg)}
            >
              {busy === false ? <Spinner /> : null}
              <span>Don’t allow</span>
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void answer(true)}
              className={cn(buttonVariants.primary, buttonSizes.lg)}
            >
              {busy === true ? <Spinner /> : null}
              <span>Allow</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
