import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  callPlatformAuth,
  PLATFORM_AUTH_FETCH_TIMEOUT_MS,
  resetPlatformAuthSingleFlightForTests,
} from '../src/garage/auth/platformAuthClient';

describe('callPlatformAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetPlatformAuthSingleFlightForTests();
  });

  it('posts device_fallback and maps session tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        provider: 'device_fallback',
        platformId: 'device:abc',
        session: {
          access_token: 'a',
          refresh_token: 'r',
          expires_at: 99,
          user_id: 'u1',
          email: null,
        },
      }),
    });

    const result = await callPlatformAuth(
      { url: 'http://127.0.0.1:54321', anonKey: 'anon' },
      { provider: 'device_fallback', deviceId: 'device-uuid-1' },
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({
      ok: true,
      provider: 'device_fallback',
      platformId: 'device:abc',
      session: {
        accessToken: 'a',
        refreshToken: 'r',
        userId: 'u1',
        email: null,
        expiresAt: 99,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:54321/functions/v1/platform-auth',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'anon',
          Authorization: 'Bearer anon',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('maps Edge error bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, code: 'invalid_signature', message: 'bad gc' }),
    });
    const result = await callPlatformAuth(
      { url: 'http://127.0.0.1:54321', anonKey: 'anon' },
      {
        provider: 'game_center',
        teamPlayerID: 't',
        bundleId: 'b',
        publicKeyURL: 'https://static.gc.apple.com/public-key/gc-prod-1.cer',
        signature: 'sig',
        salt: 'salt',
        timestamp: 1,
      },
      fetchMock as unknown as typeof fetch,
    );
    expect(result).toEqual({
      ok: false,
      code: 'invalid_signature',
      message: 'bad gc',
    });
  });

  it('maps AbortError / timeout to network_error', async () => {
    const err = new Error(`platform-auth timed out after ${PLATFORM_AUTH_FETCH_TIMEOUT_MS}ms`);
    err.name = 'AbortError';
    const fetchMock = vi.fn().mockRejectedValue(err);

    const result = await callPlatformAuth(
      { url: 'http://127.0.0.1:54321', anonKey: 'anon' },
      { provider: 'device_fallback', deviceId: 'device-uuid-1' },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('network_error');
      expect(result.message).toMatch(/timed out|abort/i);
    }
  });

  it('single-flights concurrent device_fallback posts for the same deviceId', async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const req = {
      provider: 'device_fallback' as const,
      deviceId: 'device-uuid-shared',
    };
    const config = { url: 'http://127.0.0.1:54321', anonKey: 'anon' };
    const p1 = callPlatformAuth(config, req, fetchMock as unknown as typeof fetch);
    const p2 = callPlatformAuth(config, req, fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        provider: 'device_fallback',
        platformId: 'device-uuid-shared',
        session: {
          access_token: 'a',
          refresh_token: 'r',
          expires_at: 99,
          user_id: 'u1',
          email: null,
        },
      }),
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(r1.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
