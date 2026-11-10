import type { AuthPort, AuthResult, AuthSession } from './AuthPort';
import { getOrCreateDeviceFallbackId } from './deviceFallbackStore';
import { callPlatformAuth } from './platformAuthClient';
import { collectPlatformProof } from './platformProof';
import { readSupabasePublicConfig } from './supabasePublicConfig';

/**
 * C12 native silent identity → Edge `platform-auth`.
 *
 * 1. Try GC / PGS proof via `@tubinex/expo-game-services` (dev build).
 * 2. Else device-fallback UUID (SecureStore / Keychain; never IDFV/ANDROID_ID).
 * 3. POST platform-auth; apply minted session on the AuthPort.
 *
 * Needs an EAS **dev build** for real GC/PGS — not Expo Go.
 */

export type NativePlatformIdentityProvider = 'game_center' | 'play_games' | 'device_fallback';

export const NATIVE_IDENTITY_MISCONFIGURED_CODE = 'native_identity_misconfigured' as const;

export type SessionApplyingAuthPort = AuthPort & {
  /** Persist an Edge-minted session (generateLink + verifyOtp result). */
  applySession(session: AuthSession): Promise<void>;
};

function canApplySession(auth: AuthPort): auth is SessionApplyingAuthPort {
  return typeof (auth as SessionApplyingAuthPort).applySession === 'function';
}

/**
 * Silent native (or non-preview) first-launch auth via platform-auth Edge.
 */
export async function signInWithNativePlatformIdentity(auth: AuthPort): Promise<AuthResult> {
  const config = readSupabasePublicConfig();
  if (!config) {
    return {
      ok: false,
      code: NATIVE_IDENTITY_MISCONFIGURED_CODE,
      message:
        'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required for platform-auth.',
    };
  }

  const fallbackDeviceId = await getOrCreateDeviceFallbackId();
  const proof = await collectPlatformProof();

  const edge = proof
    ? await callPlatformAuth(config, {
        ...proof,
        fallbackDeviceId,
      })
    : await callPlatformAuth(config, {
        provider: 'device_fallback',
        deviceId: fallbackDeviceId,
      });

  if (!edge.ok) {
    return { ok: false, code: edge.code, message: edge.message };
  }

  if (canApplySession(auth)) {
    await auth.applySession(edge.session);
  }

  return { ok: true, session: edge.session };
}
