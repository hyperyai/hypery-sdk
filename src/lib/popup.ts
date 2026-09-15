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

export function centeredFeatures(w: number, h: number): string {
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
  /** Extra check on a message (and its origin) before it's accepted; rejected messages are ignored. */
  accept?: (event: MessageEvent) => boolean;
  /**
   * A window already opened (e.g. by {@link openBlankPopup} inside the click
   * handler, before any await). It is navigated to `url` instead of opening a new one.
   */
  existing?: Window | null;
}

/**
 * Open a named popup showing a small "Loading…" page. Call synchronously in the
 * user gesture (before any await) so popup blockers allow it; later navigate it
 * with `openPopup({ existing })`. Returns null when blocked or outside a browser.
 */
export function openBlankPopup(name: string, width = 480, height = 720): Window | null {
  if (typeof window === 'undefined') return null;
  const w = window.open('about:blank', name, centeredFeatures(width, height));
  if (!w) return null;
  try {
    w.document.title = 'Loading…';
    w.document.body.style.cssText = 'margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font:14px system-ui,sans-serif;color:#666';
    w.document.body.textContent = 'Loading…';
  } catch {
    /* document may be inaccessible; the blank window still works */
  }
  return w;
}

/** Close a popup, ignoring errors. Safe with null. */
export function closePopup(w: Window | null | undefined): void {
  try {
    if (w && !w.closed) w.close();
  } catch {
    /* ignore */
  }
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
  let popup: Window | null = null;
  if (opts.existing && !opts.existing.closed) {
    popup = opts.existing;
    try {
      popup.location.href = opts.url;
    } catch {
      popup = null;
    }
  } else if (opts.existing === undefined) {
    popup = window.open(opts.url, opts.name, centeredFeatures(opts.width || 480, opts.height || 720));
  }
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
      if (data && typeof data === 'object' && data.type === opts.messageType && (!opts.accept || opts.accept(event))) {
        try {
          popup!.close();
        } catch {
          /* cross-origin close may throw; ignore */
        }
        finish({ blocked: false, cancelled: false, data: data as T });
      }
    };
    window.addEventListener('message', onMessage);
    // Fallback: if the popup is closed without a message, treat it as a cancel.
    const poll = setInterval(() => {
      if (popup!.closed) finish({ blocked: false, cancelled: true });
    }, 500);
  });
}
