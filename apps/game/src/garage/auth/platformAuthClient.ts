/**
 * Client → Edge `platform-auth` (C12).
 * Uses public anon key only; Edge holds service role.
 */

import type { AuthSession } from './AuthPort';
import type { SupabasePublicConfig } from './supabasePublicConfig';

export type PlatformAuthProvider = 'game_center' | 'play_games' | 'device_fallback';

export type PlatformAuthRequest =
  | {
      readonly provider: 'game_center';
      readonly teamPlayerID: string;
      readonly bundleId: string;
      readonly publicKeyURL: string;
      readonly signature: string;
      readonly salt: string;
      readonly timestamp: number;
      readonly fallbackDeviceId?: string;
    }
  | {
      readonly provider: 'play_games';
      readonly serverAuthCode: string;
      readonly fallbackDeviceId?: string;
    }
  | {
      readonly provider: 'device_fallback';
      readonly deviceId: string;
    };

export type PlatformAuthResponse =
  | {
      readonly ok: true;
      readonly session: AuthSession;
      readonly provider: PlatformAuthProvider;
      readonly platformId: string;
    }
  | { readonly ok: false; readonly code: string; readonly message: string };

type EdgeSessionBody = {
  ok?: boolean;
  code?: string;
  message?: string;
  provider?: string;
  platformId?: string;
  session?: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number | null;
    user_id?: string;
    email?: string | null;
  };
};

export async function callPlatformAuth(
  config: SupabasePublicConfig,
  body: PlatformAuthRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<PlatformAuthResponse> {
  try {
    const res = await fetchImpl(`${config.url}/functions/v1/platform-auth`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as EdgeSessionBody;
    if (!res.ok || !json.ok || !json.session?.access_token || !json.session.user_id) {
      return {
        ok: false,
        code: json.code ?? `http_${res.status}`,
        message: json.message ?? `platform-auth failed (${res.status})`,
      };
    }
    return {
      ok: true,
      provider: (json.provider as PlatformAuthProvider) ?? body.provider,
      platformId: json.platformId ?? '',
      session: {
        accessToken: json.session.access_token,
        refreshToken: json.session.refresh_token ?? null,
        userId: json.session.user_id,
        email: json.session.email ?? null,
        expiresAt: json.session.expires_at ?? null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
