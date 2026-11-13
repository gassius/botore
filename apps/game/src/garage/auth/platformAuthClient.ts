/**
 * Client → Edge `platform-auth` (C12).
 * Uses public anon key only; Edge holds service role.
 *
 * C16: `platformId` on a successful response is for auth correlation only —
 * never pass it into Nameplate / ranking / settings / fight labels.
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

/** Bound silent first-launch so a hung Edge call cannot pin the splash forever. */
export const PLATFORM_AUTH_FETCH_TIMEOUT_MS = 15_000;

/** In-flight platform-auth calls keyed by identity (B5 concurrent-mint harden). */
const platformAuthInFlight = new Map<string, Promise<PlatformAuthResponse>>();

/** Test helper — clears single-flight map between cases. */
export function resetPlatformAuthSingleFlightForTests(): void {
  platformAuthInFlight.clear();
}

export function platformAuthFlightKey(body: PlatformAuthRequest): string {
  if (body.provider === 'device_fallback') {
    return `device_fallback:${body.deviceId}`;
  }
  if (body.provider === 'play_games') {
    return `play_games:${body.serverAuthCode}:${body.fallbackDeviceId ?? ''}`;
  }
  return `game_center:${body.teamPlayerID}:${body.fallbackDeviceId ?? ''}`;
}

function abortSignalForTimeout(ms: number): AbortSignal {
  const timeoutFn = (AbortSignal as unknown as { timeout?: (n: number) => AbortSignal }).timeout;
  if (typeof timeoutFn === 'function') return timeoutFn.call(AbortSignal, ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function callPlatformAuthOnce(
  config: SupabasePublicConfig,
  body: PlatformAuthRequest,
  fetchImpl: typeof fetch,
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

/**
 * POST platform-auth with per-identity single-flight. Concurrent silent-auth
 * mounts (or StrictMode double effects) share one in-flight request so the
 * Edge function is not hit twice for the same device / platform proof.
 */
export async function callPlatformAuth(
  config: SupabasePublicConfig,
  body: PlatformAuthRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<PlatformAuthResponse> {
  const key = platformAuthFlightKey(body);
  const existing = platformAuthInFlight.get(key);
  if (existing) return existing;

  const pending = callPlatformAuthOnce(config, body, fetchImpl).finally(() => {
    if (platformAuthInFlight.get(key) === pending) {
      platformAuthInFlight.delete(key);
    }
  });
  platformAuthInFlight.set(key, pending);
  return pending;
}
