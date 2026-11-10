/**
 * Client → Edge `platform-auth` (C12).
 * Uses public anon key only; Edge holds service role.
 *
 * C16: `platformId` on a successful response is for auth correlation only —
 * never pass it into Nameplate / ranking / settings / fight labels. Prefer
 * {@link platformIdLogToken} if a log line needs correlation.
 */

import { hashPlatformIdForLog } from '../../identity/platformPlayerId';
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

/** Bound silent first-launch so a hung Edge call cannot pin the splash forever. */
export const PLATFORM_AUTH_FETCH_TIMEOUT_MS = 15_000;

/** Hashed platform id for internal logs — never show the raw id in product UI. */
export function platformIdLogToken(platformId: string): string {
  return hashPlatformIdForLog(platformId);
}

function abortSignalForTimeout(ms: number): AbortSignal {
  const timeoutFn = (AbortSignal as unknown as { timeout?: (n: number) => AbortSignal }).timeout;
  if (typeof timeoutFn === 'function') return timeoutFn.call(AbortSignal, ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

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
      signal: abortSignalForTimeout(PLATFORM_AUTH_FETCH_TIMEOUT_MS),
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
    const aborted =
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof DOMException !== 'undefined' &&
        err instanceof DOMException &&
        err.name === 'AbortError');
    return {
      ok: false,
      code: 'network_error',
      message: aborted
        ? `platform-auth timed out after ${PLATFORM_AUTH_FETCH_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  }
}
