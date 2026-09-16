import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_POST_LOGOUT_REDIRECT,
  resolvePostLogoutRedirect,
} from '../logout-redirect';

describe('resolvePostLogoutRedirect', () => {
  it('defaults to "/" when unconfigured (existing consumers are unchanged)', () => {
    expect(DEFAULT_POST_LOGOUT_REDIRECT).toBe('/');
    expect(resolvePostLogoutRedirect(undefined)).toBe('/');
  });

  it('uses an explicit URL or path', () => {
    expect(resolvePostLogoutRedirect('/home')).toBe('/home');
    expect(resolvePostLogoutRedirect('https://example.com/bye')).toBe(
      'https://example.com/bye'
    );
  });

  it('suppresses navigation for false / null / empty string', () => {
    expect(resolvePostLogoutRedirect(false)).toBeNull();
    expect(resolvePostLogoutRedirect(null)).toBeNull();
    expect(resolvePostLogoutRedirect('')).toBeNull();
    expect(resolvePostLogoutRedirect('   ')).toBeNull();
  });

  it('resolves a callback, including one that decides per environment', () => {
    expect(resolvePostLogoutRedirect(() => '/home')).toBe('/home');
    expect(resolvePostLogoutRedirect(() => false)).toBeNull();
    expect(resolvePostLogoutRedirect(() => null)).toBeNull();
    // a callback that navigates itself and returns nothing
    expect(resolvePostLogoutRedirect(() => {})).toBeNull();

    const pick = (desktop: boolean) =>
      resolvePostLogoutRedirect(() => (desktop ? false : '/home'));
    expect(pick(true)).toBeNull();
    expect(pick(false)).toBe('/home');
  });

  it('contains a throwing callback rather than failing logout', () => {
    expect(
      resolvePostLogoutRedirect(() => {
        throw new Error('boom');
      })
    ).toBeNull();
  });
});
