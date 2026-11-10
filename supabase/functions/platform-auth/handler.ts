/**
 * platform-auth Edge Function handler (C12).
 *
 * Verifies Game Center / Play Games proofs (or device-fallback UUID), upserts
 * player_identities, mints a session via generateLink + verifyOtp.
 * No anonymous auth. No signInWithIdToken.
 */
import { verifyGameCenterProof, type GameCenterProof, type GcVerifyDeps } from './gcVerify.ts';
import { verifyPlayGamesProof, type PlayGamesProof, type PgsVerifyDeps } from './pgsVerify.ts';
import {
  mintSessionForPlatformIdentity,
  type PlatformAuthAdmin,
  type PlatformProvider,
} from './sessionMint.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export type PlatformAuthDeps = {
  readonly admin: PlatformAuthAdmin;
  readonly gc: GcVerifyDeps;
  readonly pgs: Omit<PgsVerifyDeps, 'fetch'> & { fetch?: PgsVerifyDeps['fetch'] };
  readonly fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
};

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type RequestBody = {
  provider?: string;
  // Game Center
  teamPlayerID?: string;
  bundleId?: string;
  publicKeyURL?: string;
  signature?: string;
  salt?: string;
  timestamp?: number;
  // Play Games
  serverAuthCode?: string;
  // Device fallback / link
  deviceId?: string;
  fallbackDeviceId?: string;
};

function isProvider(v: string | undefined): v is PlatformProvider {
  return v === 'game_center' || v === 'play_games' || v === 'device_fallback';
}

export async function handlePlatformAuthRequest(
  req: Request,
  deps: PlatformAuthDeps,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, code: 'method_not_allowed', message: 'POST only' }, 405);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ ok: false, code: 'bad_json', message: 'Invalid JSON body' }, 400);
  }

  if (!isProvider(body.provider)) {
    return json(
      {
        ok: false,
        code: 'bad_provider',
        message: 'provider must be game_center | play_games | device_fallback',
      },
      400,
    );
  }

  let platformId: string;

  if (body.provider === 'game_center') {
    const proof: GameCenterProof = {
      teamPlayerID: String(body.teamPlayerID ?? ''),
      bundleId: String(body.bundleId ?? ''),
      publicKeyURL: String(body.publicKeyURL ?? ''),
      signature: String(body.signature ?? ''),
      salt: String(body.salt ?? ''),
      timestamp: Number(body.timestamp),
    };
    const verified = await verifyGameCenterProof(proof, deps.gc);
    if (!verified.ok) {
      return json({ ok: false, code: verified.code, message: verified.message }, 401);
    }
    platformId = verified.platformId;
  } else if (body.provider === 'play_games') {
    const proof: PlayGamesProof = { serverAuthCode: String(body.serverAuthCode ?? '') };
    const verified = await verifyPlayGamesProof(proof, {
      fetch: deps.pgs.fetch ?? deps.fetch,
      webClientId: deps.pgs.webClientId,
      webClientSecret: deps.pgs.webClientSecret,
      applicationId: deps.pgs.applicationId,
    });
    if (!verified.ok) {
      return json({ ok: false, code: verified.code, message: verified.message }, 401);
    }
    platformId = verified.platformId;
  } else {
    const deviceId = String(body.deviceId ?? '').trim();
    if (!deviceId || deviceId.length < 16) {
      return json(
        {
          ok: false,
          code: 'bad_device_id',
          message: 'deviceId required (Keychain / Block Store UUID; never IDFV/ANDROID_ID)',
        },
        400,
      );
    }
    platformId = deviceId;
  }

  const minted = await mintSessionForPlatformIdentity(deps.admin, {
    provider: body.provider,
    platformId,
    fallbackDeviceId: body.fallbackDeviceId ?? null,
  });

  if (!minted.ok) {
    const status = minted.code === 'account_deleted' ? 403 : 500;
    return json({ ok: false, code: minted.code, message: minted.message }, status);
  }

  return json(
    {
      ok: true,
      created: minted.created,
      provider: body.provider,
      platformId,
      session: {
        access_token: minted.session.accessToken,
        refresh_token: minted.session.refreshToken,
        expires_at: minted.session.expiresAt,
        user_id: minted.session.userId,
        email: minted.session.email,
      },
    },
    200,
  );
}
