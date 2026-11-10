/**
 * C12 device-fallback identity — random UUID in SecureStore (iOS Keychain) /
 * web localStorage stand-in. Never IDFV / ANDROID_ID.
 *
 * Android Block Store lands with the native Expo module; until then SecureStore
 * is the cross-platform secure persistence used by the silent first-launch path.
 */

export const DEVICE_FALLBACK_STORAGE_KEY = 'botore.auth.device_fallback.v1';

function preferWebStorage(): boolean {
  if (typeof process !== 'undefined' && process.env.EXPO_OS === 'web') return true;
  return typeof localStorage !== 'undefined';
}

async function readRaw(): Promise<string | null> {
  if (preferWebStorage()) {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(DEVICE_FALLBACK_STORAGE_KEY);
    } catch {
      return null;
    }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    return await SecureStore.getItemAsync(DEVICE_FALLBACK_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeRaw(value: string): Promise<void> {
  if (preferWebStorage()) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(DEVICE_FALLBACK_STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    await SecureStore.setItemAsync(DEVICE_FALLBACK_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function newDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Extremely rare fallback for older JS engines in tests.
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Load or create the durable device-fallback UUID (Keychain / SecureStore). */
export async function getOrCreateDeviceFallbackId(): Promise<string> {
  const existing = await readRaw();
  if (existing && existing.length >= 16) return existing;
  const id = newDeviceId();
  await writeRaw(id);
  return id;
}
