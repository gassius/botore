/**
 * combat-v1 fight Edge Function entrypoint (F2).
 *
 * Local: `pnpm exec supabase functions serve combat-v1`
 * Runtime evidence: `deno test -A supabase/functions/combat-v1`
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { handleCombatRequest, type CombatDeps, type FightContext } from './handler.ts';

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function b64urlToJson(s: string): Record<string, unknown> | null {
  try {
    const bytes = b64urlToBytes(s);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Verify HS256 JWT and return payload, or null. */
async function verifyHs256Jwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    b64urlToBytes(sigB64),
    encoder.encode(`${headerB64}.${payloadB64}`),
  );
  if (!ok) return null;
  return b64urlToJson(payloadB64);
}

function buildDeps(): CombatDeps {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // Local default matches supabase start + smoke mint; hosted sets secrets.
  const jwtSecret =
    Deno.env.get('SUPABASE_JWT_SECRET') ??
    Deno.env.get('JWT_SECRET') ??
    'super-secret-jwt-token-with-at-least-32-characters-long';

  return {
    async getUserId(authHeader: string) {
      const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!jwt) return null;

      const userClient = createClient(supabaseUrl, anonKey || serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Pass JWT explicitly — Edge has no persisted session.
      const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
      if (!userError && userData.user?.id) return userData.user.id;

      // Local/smoke fallback: HMAC-verify minted seed-user JWTs when Auth
      // getUser rejects incomplete seed rows. Signature still required.
      const payload = await verifyHs256Jwt(jwt, jwtSecret);
      if (
        payload &&
        payload['role'] === 'authenticated' &&
        typeof payload['sub'] === 'string' &&
        payload['sub'].length > 0
      ) {
        const exp = payload['exp'];
        if (typeof exp === 'number' && exp * 1000 < Date.now()) return null;
        return payload['sub'];
      }
      return null;
    },
    async prepareFightContext(accountId: string, opponentId: string) {
      const admin = createClient(supabaseUrl, serviceKey || anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: ctxRaw, error: ctxError } = await admin.rpc('prepare_fight_context', {
        p_account_id: accountId,
        p_opponent_id: opponentId,
      });
      if (ctxError) {
        throw new Error(ctxError.message);
      }
      return ctxRaw as FightContext;
    },
  };
}

Deno.serve((req) => handleCombatRequest(req, buildDeps()));
