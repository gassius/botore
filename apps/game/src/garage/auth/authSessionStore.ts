import type { AuthSession } from './AuthPort';

/** Secure persistence for relaunch restore. Native uses SecureStore; web uses localStorage. */
export interface AuthSessionStore {
  load(): Promise<AuthSession | null>;
  save(session: AuthSession | null): Promise<void>;
}

export const AUTH_SESSION_STORAGE_KEY = 'botore.auth.session.v1';

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === 'string' &&
    (v.refreshToken === null || typeof v.refreshToken === 'string') &&
    typeof v.userId === 'string' &&
    (v.email === null || typeof v.email === 'string') &&
    (v.expiresAt === null || typeof v.expiresAt === 'number')
  );
}

/** In-memory store for unit tests and Unavailable/Dev adapters that do not persist. */
export function createMemoryAuthSessionStore(initial: AuthSession | null = null): AuthSessionStore {
  let session = initial;
  return {
    async load() {
      return session;
    },
    async save(next) {
      session = next;
    },
  };
}

function createWebAuthSessionStore(): AuthSessionStore {
  return {
    async load() {
      try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isAuthSession(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    async save(session) {
      try {
        if (typeof localStorage === 'undefined') return;
        if (!session) {
          localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
          return;
        }
        localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch {
        // Quota / private mode — session stays in memory only.
      }
    },
  };
}

function createNativeSecureAuthSessionStore(): AuthSessionStore {
  // Lazy require so Vitest / Node can import auth modules without native SecureStore.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
  return {
    async load() {
      try {
        const raw = await SecureStore.getItemAsync(AUTH_SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isAuthSession(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    async save(session) {
      try {
        if (!session) {
          await SecureStore.deleteItemAsync(AUTH_SESSION_STORAGE_KEY);
          return;
        }
        await SecureStore.setItemAsync(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch {
        // Device lock / SecureStore unavailable — memory session remains.
      }
    },
  };
}

function preferWebStorage(): boolean {
  // Avoid importing react-native (breaks Vitest). Web preview has localStorage;
  // Expo may also set EXPO_OS=web.
  if (typeof process !== 'undefined' && process.env.EXPO_OS === 'web') return true;
  return typeof localStorage !== 'undefined';
}

/**
 * Platform session store for playable builds.
 * Native: expo-secure-store. Web preview: localStorage (same silent first-launch restore).
 * Node/Vitest falls back to memory when SecureStore is unavailable.
 */
export function createSecureAuthSessionStore(): AuthSessionStore {
  if (preferWebStorage()) return createWebAuthSessionStore();
  try {
    return createNativeSecureAuthSessionStore();
  } catch {
    return createMemoryAuthSessionStore();
  }
}
