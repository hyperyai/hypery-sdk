import { afterEach, describe, expect, it } from 'bun:test';
import { subscribePreopenNeeded } from '../checkout';
import { centeredFeatures, closePopup, openBlankPopup, openPopup } from '../popup';

function fakePopup() {
  return {
    closed: false,
    location: { href: 'about:blank' },
    document: { title: '', body: { style: { cssText: '' }, textContent: '' } },
    close() {
      this.closed = true;
    },
  };
}

function installWindow(openResult: any) {
  const listeners: ((e: any) => void)[] = [];
  const calls: any[] = [];
  (globalThis as any).window = {
    open: (...args: any[]) => {
      calls.push(args);
      return openResult;
    },
    addEventListener: (_t: string, fn: any) => listeners.push(fn),
    removeEventListener: (_t: string, fn: any) => listeners.splice(listeners.indexOf(fn), 1),
    innerWidth: 1000,
    innerHeight: 800,
  };
  return { listeners, calls };
}

const realWindow = (globalThis as any).window;
afterEach(() => {
  (globalThis as any).window = realWindow;
});

describe('subscribePreopenNeeded', () => {
  it('pre-opens only for authenticated popup-mode subscriptions', () => {
    expect(subscribePreopenNeeded('subscription', 'popup', true)).toBe(true);
    expect(subscribePreopenNeeded('subscription', 'popup', false)).toBe(false);
    expect(subscribePreopenNeeded('subscription', 'redirect', true)).toBe(false);
    expect(subscribePreopenNeeded('purchase', 'popup', true)).toBe(false);
  });
});

describe('openBlankPopup', () => {
  it('opens about:blank with the name and a loading document', () => {
    const w = fakePopup();
    const { calls } = installWindow(w);
    expect(openBlankPopup('hypery-subscribe', 480, 760)).toBe(w as any);
    expect(calls[0][0]).toBe('about:blank');
    expect(calls[0][1]).toBe('hypery-subscribe');
    expect(calls[0][2]).toContain('width=480,height=760');
    expect(w.document.body.textContent).toBe('Loading…');
  });

  it('returns null when blocked', () => {
    installWindow(null);
    expect(openBlankPopup('x')).toBeNull();
  });

  it('closePopup tolerates null and closes open windows', () => {
    closePopup(null);
    const w = fakePopup();
    closePopup(w as any);
    expect(w.closed).toBe(true);
  });

  it('centeredFeatures centers within the viewport', () => {
    installWindow(null);
    expect(centeredFeatures(400, 600)).toContain('left=300,top=100');
  });
});

describe('openPopup with an existing window', () => {
  it('navigates the existing window instead of opening a new one, and resolves on an accepted message', async () => {
    const w = fakePopup();
    const { listeners, calls } = installWindow(null);
    const p = openPopup({
      url: 'https://hypery.ai/subscribe/s1',
      name: 'hypery-subscribe',
      expectedOrigin: 'https://hypery.ai',
      messageType: 'hypery:subscribe',
      existing: w as any,
      accept: (e) => e.data.state === 'good',
    });
    expect(calls.length).toBe(0);
    expect(w.location.href).toBe('https://hypery.ai/subscribe/s1');
    for (const l of [...listeners]) l({ origin: 'https://hypery.ai', data: { type: 'hypery:subscribe', state: 'bad' } });
    for (const l of [...listeners]) l({ origin: 'https://evil.example', data: { type: 'hypery:subscribe', state: 'good' } });
    for (const l of [...listeners]) l({ origin: 'https://hypery.ai', data: { type: 'hypery:subscribe', state: 'good' } });
    const r = await p;
    expect(r).toMatchObject({ blocked: false, cancelled: false, data: { state: 'good' } });
    expect(w.closed).toBe(true);
  });

  it('reports blocked when the pre-opened window is null', async () => {
    const { calls } = installWindow(fakePopup());
    const r = await openPopup({ url: 'u', name: 'n', expectedOrigin: 'o', messageType: 't', existing: null });
    expect(r).toEqual({ blocked: true });
    expect(calls.length).toBe(0);
  });
});
