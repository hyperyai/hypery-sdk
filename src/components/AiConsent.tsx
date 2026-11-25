/**
 * AI data consent: asks before the app's first AI request what may be sent to AI providers (App Review guidelines
 * 5.1.1(i), 5.1.2(i)), says what is sent and who receives it, and keeps the answer.
 *
 * - `AiConsentProvider` asks once, when the person first opens the app (closing counts as "Don't allow"), and
 *   gives the app `useAiConsent().ensureAiConsent()`: call it before AI work and it resolves true at once when
 *   allowed, or shows the dialog and resolves with the answer. An AI action waits for the person instead of failing.
 * - `HyperyProvider` with `config.aiConsent` puts the provider in for you and calls it before every Hypery AI request
 *   made through `authenticatedFetch`.
 * - `AiConsentDialog` is the dialog alone.
 */

'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.js';
import { ErrorNote, Spinner, brandStyle, buttonSizes, buttonVariants } from './ui/primitives.js';
import { cn } from '../lib/utils.js';
import {
  AI_CONSENT_RECIPIENTS,
  AiConsentController,
  hyperyAiConsentStorage,
  type AiConsentAnswer,
  type AiConsentStorage,
} from '../lib/ai-consent.js';
import { AuthContext } from '../lib/context.js';

const DEFAULT_DATA_SENT = [
  'What you ask the app’s AI features, and their replies',
  'The content you choose to use with them, such as text, files or recordings',
];

/** What the dialog says. */
export interface AiConsentText {
  /** What this app sends, in the person's terms. Defaults to a general description. */
  dataSent?: string[];
  /** Who receives it. Defaults to `AI_CONSENT_RECIPIENTS`. */
  recipients?: string[];
  /** The app's privacy policy, linked in the dialog. */
  privacyPolicyUrl?: string;
  branding?: { appName?: string; primaryColor?: string };
}

/** Props of {@link AiConsentDialog}. */
export interface AiConsentDialogProps extends AiConsentText {
  isOpen: boolean;
  /** Called with the answer. Closing the dialog answers `false`. The dialog shows the error if this throws. */
  onAnswer: (allowed: boolean) => Promise<void> | void;
}

/** The dialog: what is sent, who receives it, Allow / Don't allow. */
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
            {appName}’s AI features send your content to AI providers to do the work. Nothing is sent unless you allow it.
          </DialogDescription>
        </DialogHeader>
        <div className="hy:mt-5 hy:flex hy:flex-col hy:gap-4 hy:text-sm hy:text-muted-foreground">
          <section>
            <p className="hy:font-medium hy:text-foreground">What is sent</p>
            <ul className="hy:mt-1 hy:list-disc hy:space-y-0.5 hy:ps-5">
              {dataSent.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </section>
          <section>
            <p className="hy:font-medium hy:text-foreground">Who receives it</p>
            <ul className="hy:mt-1 hy:list-disc hy:space-y-0.5 hy:ps-5">
              {recipients.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <p className="hy:mt-1">They use it only to answer the request.</p>
          </section>
          <p>
            Your name, email and payment details are not sent. If you don’t allow it, the app works as usual with AI
            features turned off.
            {privacyPolicyUrl ? (
              <>
                {' '}
                <a href={privacyPolicyUrl} target="_blank" rel="noreferrer" className="hy:underline">
                  Privacy Policy
                </a>
              </>
            ) : null}
          </p>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="hy:flex hy:flex-col-reverse hy:gap-2 hy:sm:flex-row hy:sm:justify-end">
            <button type="button" disabled={busy !== null} onClick={() => void answer(false)}
              className={cn(buttonVariants.ghost, buttonSizes.lg)}>
              {busy === false ? <Spinner /> : null}
              <span>Don’t allow</span>
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void answer(true)}
              className={cn(buttonVariants.primary, buttonSizes.lg)}>
              {busy === true ? <Spinner /> : null}
              <span>Allow</span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** What `useAiConsent()` gives the app. */
export interface AiConsentValue {
  /** The person's answer: true, false, or null while not asked yet (or still loading). */
  answer: AiConsentAnswer;
  /** Resolves true at once when allowed; otherwise shows the dialog and resolves with the person's answer. */
  ensureAiConsent: () => Promise<boolean>;
  /** Change the answer (e.g. a settings switch). */
  setAnswer: (allowed: boolean) => Promise<void>;
}

const AiConsentContext = createContext<AiConsentValue | null>(null);

/** Props of {@link AiConsentProvider}. */
export interface AiConsentProviderProps extends AiConsentText {
  /** The signed-in person: their answer is loaded again when the account changes. */
  userId?: string | null;
  /**
   * Where the answer is kept, with the person's Hypery account. Inside HyperyProvider the default reads and writes
   * Hypery with its token (`hyperyAiConsentStorage`). Outside it, pass one: `appRouteAiConsentStorage()` when the
   * app's server holds the token.
   */
  storage?: AiConsentStorage;
  /** Ask once as soon as the person opens the app (default true). Off: asked at the first `ensureAiConsent()`. */
  askOnStart?: boolean;
  children?: React.ReactNode;
}

/**
 * @example
 * ```tsx
 * <AiConsentProvider userId={user?.id} storage={appRouteAiConsentStorage()} branding={{ appName: 'Acme' }}
 *   dataSent={['What you ask Acme’s assistant', 'The notes it reads to answer']}
 *   privacyPolicyUrl="https://acme.app/privacy">
 *   <App />
 * </AiConsentProvider>
 *
 * // Before AI work:
 * const { ensureAiConsent } = useAiConsent();
 * if (await ensureAiConsent()) await summarize();
 * ```
 */
export function AiConsentProvider({
  userId,
  storage: given,
  askOnStart = true,
  children,
  ...text
}: AiConsentProviderProps) {
  const auth = useContext(AuthContext);
  const gatewayUrl = auth?.gatewayUrl;
  const getAccessToken = auth?.getAccessToken;
  const storage = useMemo(() => {
    if (given) return given;
    if (gatewayUrl && getAccessToken) return hyperyAiConsentStorage({ gatewayUrl, getAccessToken });
    throw new Error('AiConsentProvider needs `storage` outside HyperyProvider, e.g. appRouteAiConsentStorage()');
  }, [given, gatewayUrl, getAccessToken]);
  const controller = useMemo(() => new AiConsentController(storage, askOnStart), [storage, userId, askOnStart]);
  const { answer, open } = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useEffect(() => {
    controller.load().catch(() => {});
  }, [controller]);

  const value = useMemo<AiConsentValue>(
    () => ({ answer, ensureAiConsent: () => controller.ensure(), setAnswer: (allowed) => controller.set(allowed) }),
    [answer, controller],
  );
  return (
    <AiConsentContext.Provider value={value}>
      {children}
      <AiConsentDialog {...text} isOpen={open} onAnswer={(allowed) => controller.respond(allowed)} />
    </AiConsentContext.Provider>
  );
}

/** The person's AI consent, inside an `AiConsentProvider` (or a `HyperyProvider` with `config.aiConsent`). */
export function useAiConsent(): AiConsentValue {
  const value = useContext(AiConsentContext);
  if (!value) throw new Error('useAiConsent must be used within AiConsentProvider (or HyperyProvider with aiConsent)');
  return value;
}

/** @internal For HyperyProvider: the consent context when present, without throwing. */
export function useOptionalAiConsent(): AiConsentValue | null {
  return useContext(AiConsentContext);
}
