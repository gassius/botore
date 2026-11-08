/**
 * combat-v1 fight Edge Function (F2).
 *
 * - Authenticates the caller
 * - Loads immutable fighter snapshots via prepare_fight_context (eligibility,
 *   ownership, allowance availability — no consume)
 * - Creates an unpredictable seed with Web Crypto CSPRNG (sole CSPRNG site)
 * - Runs framework-neutral simulateBattle
 * - Returns a durable semantic replay + result (persistence is F3)
 *
 * Local: `pnpm exec supabase functions serve combat-v1`
 * Runtime evidence: `node scripts/edge-combat-runtime-check.mjs`
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { createSha256Rng, seedToKeyMaterial } from '../_shared/botore/rng/index.js';
import { simulateBattle } from '../_shared/botore/combat-engine/index.js';
import { validateReplay, verifyReplay } from '../_shared/botore/replay/index.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, idempotency-key',
};

type FighterRow = {
  characterId: string;
  displayName: string;
  hp: number;
  strength: number;
  agility: number;
  speed: number;
  weaponKind: 'sword' | 'axe' | 'dagger';
  weaponPower: number;
  loadoutVersionId: string;
  atlasVersion: string;
};

type FightContext =
  | {
      ok: true;
      code: string;
      utcDay: string;
      allowancesRemaining: number;
      rulesVersion: string;
      attacker: FighterRow;
      defender: FighterRow;
    }
  | {
      ok: false;
      code: string;
      message: string;
      allowancesRemaining?: number;
      utcDay?: string;
    };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method not allowed', code: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'missing bearer token', code: 'unauthenticated' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body', code: 'invalid_body' }, 400);
  }

  const opponentId =
    typeof body === 'object' &&
    body !== null &&
    'opponentId' in body &&
    typeof (body as { opponentId: unknown }).opponentId === 'string'
      ? (body as { opponentId: string }).opponentId.trim()
      : '';

  if (!opponentId) {
    return json({ error: 'body must be { opponentId: string }', code: 'invalid_body' }, 400);
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey || serviceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: 'invalid or expired token', code: 'unauthenticated' }, 401);
    }
    const accountId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey || anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: ctxRaw, error: ctxError } = await admin.rpc('prepare_fight_context', {
      p_account_id: accountId,
      p_opponent_id: opponentId,
    });

    if (ctxError) {
      return json({ error: ctxError.message, code: 'fight_context_rpc_failed' }, 503);
    }

    const ctx = ctxRaw as FightContext;
    if (!ctx || typeof ctx !== 'object' || !('ok' in ctx)) {
      return json({ error: 'malformed fight context', code: 'fight_context_invalid' }, 500);
    }

    if (!ctx.ok) {
      const status =
        ctx.code === 'allowance_exhausted'
          ? 409
          : ctx.code === 'unknown_opponent' || ctx.code === 'no_character'
            ? 404
            : ctx.code === 'unauthenticated'
              ? 401
              : 400;
      return json({ error: ctx.message, code: ctx.code }, status);
    }

    const battleId = crypto.randomUUID();
    const seed = createBattleSeed();
    const attacker = toSnapshot(ctx.attacker);
    const defender = toSnapshot(ctx.defender);

    const replay = simulateBattle({
      battleId,
      seed,
      attacker,
      defender,
      rng: createSha256Rng(seedToKeyMaterial(seed)),
    });

    // Seal integrity before leaving the Edge runtime.
    validateReplay(replay);
    verifyReplay(replay);

    const winner =
      replay.outcome.reason === 'defeat' ? replay.outcome.winner : replay.outcome.winnerByTiebreak;

    return json(
      {
        battleId,
        status: 'computed',
        rulesVersion: 'combat-v1',
        seed,
        outcome: {
          winner,
          reason: replay.outcome.reason,
        },
        replay,
        loadoutVersionIds: {
          attacker: ctx.attacker.loadoutVersionId,
          defender: ctx.defender.loadoutVersionId,
        },
        atlasVersions: {
          attacker: ctx.attacker.atlasVersion,
          defender: ctx.defender.atlasVersion,
        },
        allowancesRemaining: ctx.allowancesRemaining,
        utcDay: ctx.utcDay,
        persistence: 'pending_f3',
        service: 'combat-v1',
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message, code: 'combat_failed' }, 500);
  }
});

/** Sole CSPRNG boundary for fight seeds (Web Crypto). */
function createBattleSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function toSnapshot(row: FighterRow) {
  return {
    characterId: row.characterId,
    displayName: row.displayName,
    hp: row.hp,
    strength: row.strength,
    agility: row.agility,
    speed: row.speed,
    weaponKind: row.weaponKind,
    weaponPower: row.weaponPower,
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
