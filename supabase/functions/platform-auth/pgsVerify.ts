/**
 * Google Play Games Services v2 server-side player verification (C12).
 *
 * Client: requestServerSideAccess(webClientId) → serverAuthCode
 * Edge: exchange code → access token → games applications.verify → player_id
 */

export type PlayGamesProof = {
  readonly serverAuthCode: string;
};

export type PgsVerifyResult =
  | { readonly ok: true; readonly platformId: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

export type PgsVerifyDeps = {
  readonly fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  readonly webClientId: string;
  readonly webClientSecret: string;
  readonly applicationId: string;
};

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type VerifyResponse = {
  player_id?: string;
  playerId?: string;
  error?: { message?: string };
};

export async function verifyPlayGamesProof(
  proof: PlayGamesProof,
  deps: PgsVerifyDeps,
): Promise<PgsVerifyResult> {
  if (!proof.serverAuthCode.trim()) {
    return { ok: false, code: 'pgs_missing_code', message: 'serverAuthCode required' };
  }
  if (!deps.webClientId || !deps.webClientSecret || !deps.applicationId) {
    return {
      ok: false,
      code: 'pgs_misconfigured',
      message: 'PLAY_GAMES_WEB_CLIENT_ID/SECRET/APPLICATION_ID must be set',
    };
  }

  const tokenRes = await deps.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: proof.serverAuthCode,
      client_id: deps.webClientId,
      client_secret: deps.webClientSecret,
      redirect_uri: '',
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10000),
  });
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as TokenResponse;
  if (!tokenRes.ok || !tokenBody.access_token) {
    return {
      ok: false,
      code: 'pgs_token_exchange_failed',
      message: tokenBody.error_description ?? tokenBody.error ?? `HTTP ${tokenRes.status}`,
    };
  }

  const verifyUrl = `https://games.googleapis.com/games/v1/applications/${encodeURIComponent(deps.applicationId)}/verify`;
  const verifyRes = await deps.fetch(verifyUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    signal: AbortSignal.timeout(10000),
  });
  const verifyBody = (await verifyRes.json().catch(() => ({}))) as VerifyResponse;
  const playerId = verifyBody.player_id ?? verifyBody.playerId;
  if (!verifyRes.ok || !playerId) {
    return {
      ok: false,
      code: 'pgs_verify_failed',
      message: verifyBody.error?.message ?? `HTTP ${verifyRes.status}`,
    };
  }

  return { ok: true, platformId: playerId };
}
