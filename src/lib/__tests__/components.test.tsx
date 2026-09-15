import { describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { shouldStartSignIn } from '../../components/control';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { SignInForm } from '../../components/SignInForm';
import { ModernAuthForm } from '../../components/ModernAuthForm';
import { HyperyProvider } from '../context';
import { loginOptionsFor, shouldFireAuthSuccess } from '../sign-in-attempt';

const config = { clientId: 'c', redirectUri: 'https://app.test/cb', gatewayUrl: 'https://gw.test', storage: 'memory' as const };

describe('Protect / RedirectToSignIn trigger', () => {
  it('starts sign-in only when loaded, signed out, not logging out, and not already started', () => {
    const base = { isLoading: false, isAuthenticated: false, isLoggingOut: false, alreadyStarted: false };
    expect(shouldStartSignIn(base)).toBe(true);
    expect(shouldStartSignIn({ ...base, isLoading: true })).toBe(false);
    expect(shouldStartSignIn({ ...base, isAuthenticated: true })).toBe(false);
    expect(shouldStartSignIn({ ...base, isLoggingOut: true })).toBe(false);
    expect(shouldStartSignIn({ ...base, alreadyStarted: true })).toBe(false); // StrictMode re-run
  });
});

describe('auth forms', () => {
  it('fires onSuccess only after an attempt AND authentication, once', () => {
    expect(shouldFireAuthSuccess({ attempted: true, isAuthenticated: false, fired: false })).toBe(false);
    expect(shouldFireAuthSuccess({ attempted: false, isAuthenticated: true, fired: false })).toBe(false);
    expect(shouldFireAuthSuccess({ attempted: true, isAuthenticated: true, fired: false })).toBe(true);
    expect(shouldFireAuthSuccess({ attempted: true, isAuthenticated: true, fired: true })).toBe(false);
  });

  it('maps social buttons to a provider hint and email to the hosted login page', () => {
    expect(loginOptionsFor('google')).toEqual({ provider: 'google' });
    expect(loginOptionsFor('github')).toEqual({ provider: 'github' });
    expect(loginOptionsFor('email')).toBeUndefined();
  });

  it('renders no password inputs by default, and only a hosted "Continue with email" when enabled', () => {
    const html = renderToStaticMarkup(
      <HyperyProvider config={config}>
        <SignInForm />
        <ModernAuthForm />
      </HyperyProvider>,
    );
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('Continue with email');
    const enabled = renderToStaticMarkup(
      <HyperyProvider config={config}>
        <SignInForm showEmailPassword />
      </HyperyProvider>,
    );
    expect(enabled).toContain('Continue with email');
    expect(enabled).not.toContain('type="password"');
  });
});

describe('ErrorBoundary', () => {
  it('is a real error boundary: derives state from a thrown error and reports it', () => {
    expect(ErrorBoundary.getDerivedStateFromError(new Error('boom'))).toEqual({ caught: { error: new Error('boom') } });
    const onError = mock(() => {});
    const b = new ErrorBoundary({ onError, fallback: (e: any) => <p>caught {e.message}</p> });
    b.componentDidCatch(new Error('boom'), { componentStack: '' } as any);
    expect(onError).toHaveBeenCalled();
    b.state = { caught: { error: new Error('boom') } };
    expect(renderToStaticMarkup(<>{b.render()}</>)).toBe('<p>caught boom</p>');
  });

  it('keeps the error-prop alert behaviour and renders children when there is no error', () => {
    expect(renderToStaticMarkup(<ErrorBoundary error={null}><span>ok</span></ErrorBoundary>)).toBe('<span>ok</span>');
    const html = renderToStaticMarkup(<ErrorBoundary error={new Error('Bad thing')} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Bad thing');
  });
});
