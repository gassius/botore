import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDeviceFallbackId,
  DEVICE_FALLBACK_STORAGE_KEY,
  DEVICE_ID_UNPERSISTED_CODE,
  getOrCreateDeviceFallbackId,
} from '../src/garage/auth/deviceFallbackStore';

describe('getOrCreateDeviceFallbackId', () => {
  const previousOs = process.env.EXPO_OS;

  afterEach(() => {
    if (previousOs === undefined) delete process.env.EXPO_OS;
    else process.env.EXPO_OS = previousOs;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('persists and reuses a device id via localStorage', async () => {
    process.env.EXPO_OS = 'web';
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
      removeItem: (key: string) => {
        mem.delete(key);
      },
    });

    const first = await getOrCreateDeviceFallbackId();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(mem.get(DEVICE_FALLBACK_STORAGE_KEY)).toBe(first.deviceId);

    const second = await getOrCreateDeviceFallbackId();
    expect(second).toEqual(first);
  });

  it('fails closed when persist cannot be read back', async () => {
    process.env.EXPO_OS = 'web';
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        /* pretend write succeeded but never readable */
      },
      removeItem: () => undefined,
    });

    const result = await getOrCreateDeviceFallbackId();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(DEVICE_ID_UNPERSISTED_CODE);
  });

  it('clears the device-fallback id after account deletion', async () => {
    process.env.EXPO_OS = 'web';
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
      removeItem: (key: string) => {
        mem.delete(key);
      },
    });

    const first = await getOrCreateDeviceFallbackId();
    expect(first.ok).toBe(true);
    await clearDeviceFallbackId();
    expect(mem.has(DEVICE_FALLBACK_STORAGE_KEY)).toBe(false);
  });
});
