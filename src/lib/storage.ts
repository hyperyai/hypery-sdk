/**
 * Token storage utilities
 */

import type { AuthTokens, User } from '../types';

const TOKEN_KEY = 'hypery_auth_tokens';
const USER_KEY = 'hypery_auth_user';

export class TokenStorage {
  private storage: Storage | Map<string, string>;
  private storageType: 'localStorage' | 'sessionStorage' | 'memory';

  constructor(storageType: 'localStorage' | 'sessionStorage' | 'memory' = 'localStorage') {
    this.storageType = storageType;

    if (storageType === 'memory' || typeof window === 'undefined') {
      // In-memory storage for SSR or memory mode
      this.storage = new Map<string, string>();
    } else {
      this.storage = storageType === 'localStorage' ? localStorage : sessionStorage;
    }
  }

  /**
   * Save auth tokens
   */
  saveTokens(tokens: AuthTokens): void {
    const data = JSON.stringify({
      ...tokens,
      savedAt: Date.now(),
    });

    if (this.storage instanceof Map) {
      this.storage.set(TOKEN_KEY, data);
    } else {
      this.storage.setItem(TOKEN_KEY, data);
    }
  }

  /**
   * Get auth tokens
   */
  getTokens(): (AuthTokens & { savedAt: number }) | null {
    let data: string | null = null;

    if (this.storage instanceof Map) {
      data = this.storage.get(TOKEN_KEY) || null;
    } else {
      data = this.storage.getItem(TOKEN_KEY);
    }

    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Check if access token is expired
   */
  isTokenExpired(): boolean {
    const tokens = this.getTokens();
    if (!tokens) return true;

    const expiresAt = tokens.savedAt + tokens.expiresIn * 1000;
    const now = Date.now();

    // Add 60s buffer to refresh before expiration
    return now >= expiresAt - 60000;
  }

  /**
   * Clear auth tokens
   */
  clearTokens(): void {
    if (this.storage instanceof Map) {
      this.storage.delete(TOKEN_KEY);
    } else {
      this.storage.removeItem(TOKEN_KEY);
    }
  }

  /**
   * Save user info
   */
  saveUser(user: User): void {
    const data = JSON.stringify(user);

    if (this.storage instanceof Map) {
      this.storage.set(USER_KEY, data);
    } else {
      this.storage.setItem(USER_KEY, data);
    }
  }

  /**
   * Get user info
   */
  getUser(): User | null {
    let data: string | null = null;

    if (this.storage instanceof Map) {
      data = this.storage.get(USER_KEY) || null;
    } else {
      data = this.storage.getItem(USER_KEY);
    }

    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Clear user info
   */
  clearUser(): void {
    if (this.storage instanceof Map) {
      this.storage.delete(USER_KEY);
    } else {
      this.storage.removeItem(USER_KEY);
    }
  }

  /**
   * Clear all auth data
   */
  clear(): void {
    this.clearTokens();
    this.clearUser();
  }
}

