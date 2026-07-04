/**
 * Popup helpers for the seamless (in-page) auth + charge flow.
 *
 * Both auth and Stripe card-entry can run in a popup so the whole
 * press-buy → login → add-card → charge chain completes without leaving the
 * developer's page (the PayPal / Firebase `signInWithPopup` model). Each helper
 * resolves when the popup posts a completion message from the expected origin,
 * or when the popup closes (treated as a cancel). If the browser blocks the
 * popup, the helper returns `'blocked'` so the caller can fall back to redirect.
 */

import type { InteractionMode, ResolvedMode } from '../types';

/**
 * Resolve the effective mode. `auto` prefers popup on desktop but falls back to
 * redirect on mobile / in-app webviews, where popups are unreliable (this mirrors
 * Firebase's "popup on web, redirect on mobile" guidance).
 */
export function resolveInteractionMode(mode: InteractionMode | undefined): ResolvedMode {
  const m = mode || 'auto';
  if (m === 'popup' || m === 'redirect') return m;
  if (typeof navigator === 'undefined') return 'redirect';
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini/i.test(ua);
  return isMobile ? 'redirect' : 'popup';
}

function centeredFeatures(w: number, h: number): string {
  // Best-effort centering; harmless if the values are unavailable (SSR-guarded caller).
  const dualLeft = typeof window !== 'undefined' ? (window.screenLeft ?? 0) : 0;
  const dualTop = typeof window !== 'undefined' ? (window.screenTop ?? 0) : 0;
  const width = typeof window !== 'undefined' ? window.innerWidth || w : w;
  const height = typeof window !== 'undefined' ? window.innerHeight || h : h;
  const left = dualLeft + Math.max(0, (width - w) / 2);
  const top = dualTop + Math.max(0, (height - h) / 2);
  return `width=${w},height=${h},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`;
}

interface PopupOptions {
  url: string;
  /** window.open target name; also read back in the callback to detect popup context. */
  name: string;
  /** Only completion messages from this origin are trusted. */
  expectedOrigin: string;
  /** Message discriminator to accept (e.g. 'hypery:auth', 'hypery:payment-method'). */
  messageType: string;
  width?: number;
  height?: number;
}

export type PopupResult<T> = { blocked: true } | { blocked: false; cancelled: boolean; data?: T };

/**
 * Open `url` in a popup and resolve when it posts `{ type: messageType, ... }`
 * from `expectedOrigin`, or when it closes (cancelled). Returns `{ blocked: true }`
 * if the browser blocked the popup.
 */
export function openPopup<T = any>(opts: PopupOptions): Promise<PopupResult<T>> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ blocked: false, cancelled: true });
  }
  const popup = window.open(
    opts.url,
    opts.name,
    centeredFeatures(opts.width || 480, opts.height || 720),
  );
  if (!popup) {
    return Promise.resolve({ blocked: true });
  }

  return new Promise<PopupResult<T>>((resolve) => {
    let settled = false;
    const finish = (result: PopupResult<T>) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== opts.expectedOrigin) return;
      const data = event.data;
      if (data && typeof data === 'object' && data.type === opts.messageType) {
        try {
          popup.close();
        } catch {
          /* cross-origin close may throw; ignore */
        }
        finish({ blocked: false, cancelled: false, data: data as T });
      }
    };
    window.addEventListener('message', onMessage);
    // Fallback: if the popup is closed without a message, treat it as a cancel.
    const poll = setInterval(() => {
      if (popup.closed) finish({ blocked: false, cancelled: true });
    }, 500);
  });
}
