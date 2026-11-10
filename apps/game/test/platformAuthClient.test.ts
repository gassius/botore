import { afterEach, describe, expect, it, vi } from 'vitest';
import { callPlatformAuth } from '../src/garage/auth/platformAuthClient';

describe('callPlatformAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
