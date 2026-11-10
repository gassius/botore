/**
 * C12 device-fallback identity — random UUID in SecureStore (iOS Keychain) /
 * web localStorage stand-in. Never IDFV / ANDROID_ID.
 *
 * Android Block Store lands with the native Expo module; until then SecureStore
 * is the cross-platform secure persistence used by the silent first-launch path.
 */

export const DEVICE_FALLBACK_STORAGE_KEY = 'botore.auth.device_fallback.v1';

export const DEVICE_ID_UNPERSISTED_CODE = 'device_id_unpersisted' as const;

export type DeviceFallbackIdResult =
  | { readonly ok: true; readonly deviceId: string }
  | {
      readonly ok: false;
      readonly code: typeof DEVICE_ID_UNPERSISTED_CODE;
      readonly message: string;
    };

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

/** Persist and verify; returns false when the value cannot be read back. */
async function writeAndVerify(value: string): Promise<boolean> {
  if (preferWebStorage()) {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(DEVICE_FALLBACK_STORAGE_KEY, value);
      return localStorage.getItem(DEVICE_FALLBACK_STORAGE_KEY) === value;
    } catch {
      return false;
    }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    await SecureStore.setItemAsync(DEVICE_FALLBACK_STORAGE_KEY, value);
    const roundTrip = await SecureStore.getItemAsync(DEVICE_FALLBACK_STORAGE_KEY);
    return roundTrip === value;
  } catch {
    return false;
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

/** R5: wipe device-fallback UUID after account deletion so relaunch mints a new account. */
export async function clearDeviceFallbackId(): Promise<void> {
  if (preferWebStorage()) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(DEVICE_FALLBACK_STORAGE_KEY);
      }
    } catch {
      // private mode — ignore
    }
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    await SecureStore.deleteItemAsync(DEVICE_FALLBACK_STORAGE_KEY);
  } catch {
    // SecureStore unavailable — ignore
  }
}

/**
 * Load or create the durable device-fallback UUID (Keychain / SecureStore).
 * Fails closed when a new id cannot be persisted — never mint against an
 * ephemeral id that would create a new account every launch.
 */
export async function getOrCreateDeviceFallbackId(): Promise<DeviceFallbackIdResult> {
  const existing = await readRaw();
  if (existing && existing.length >= 16) return { ok: true, deviceId: existing };

  const id = newDeviceId();
  const persisted = await writeAndVerify(id);
  if (!persisted) {
    return {
      ok: false,
      code: DEVICE_ID_UNPERSISTED_CODE,
      message: 'Could not persist device identity in SecureStore / Keychain. Retry silent auth.',
    };
  }
  return { ok: true, deviceId: id };
}
