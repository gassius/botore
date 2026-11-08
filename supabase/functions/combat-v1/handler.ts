/**
 * combat-v1 Edge Function request handler (F2).
 *
 * Exported for Deno tests so the shipped Edge path is exercised without
 * spinning Deno.serve. Pure combat packages stay framework-neutral; this
 * file is the only Edge/Deno boundary (CSPRNG + HTTP + Supabase clients).
 */
import { createSha256Rng, seedToKeyMaterial, deriveSeed } from '../_shared/botore/rng/index.js';
import { simulateBattle } from '../_shared/botore/combat-engine/index.js';
import { validateReplay, verifyReplay } from '../_shared/botore/replay/index.js';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, idempotency-key',
};

/** Frozen combat-v1 golden vector (packages/combat-engine snapshot). */
export const FROZEN_GOLDEN = {
  battleId: 'b-golden-1',
  seedContext: 'botore/golden/1',
  checksum: 'd2a7c18d60ac6f5b27fcd9cfb4f183905e9c95c2b0cb8b1983549b57e8d49e2f',
  eventCount: 36,
  outcome: {
    winner: 'rogue',
    loser: 'knight',
    reason: 'defeat' as const,
  },
  attacker: {
    characterId: 'knight',
    displayName: 'Sir Bot',
    hp: 34,
    strength: 6,
    agility: 4,
    speed: 5,
    weaponKind: 'sword' as const,
    weaponPower: 3,
  },
  defender: {
    characterId: 'rogue',
    displayName: 'Dex Bot',
    hp: 26,
    strength: 4,
    agility: 7,
    speed: 8,
    weaponKind: 'dagger' as const,
    weaponPower: 2,
  },
};

export type FighterRow = {
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

export type FightContext =
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

export type FighterSnapshot = {
  characterId: string;
  displayName: string;
  hp: number;
  strength: number;
  agility: number;
  speed: number;
  weaponKind: 'sword' | 'axe' | 'dagger';
  weaponPower: number;
};

/** Injectable deps so Deno tests can exercise auth / eligibility without a live DB. */
export type CombatDeps = {
  getUserId: (authHeader: string) => Promise<string | null>;
  prepareFightContext: (accountId: string, opponentId: string) => Promise<FightContext>;
  createBattleSeed?: () => string;
  createBattleId?: () => string;
};

/** Sole CSPRNG boundary for fight seeds (Web Crypto). */
export function createBattleSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function toSnapshot(row: FighterRow): FighterSnapshot {
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

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Run combat-v1 on the Edge vendored pure packages.
 * Used by the HTTP handler and by the frozen golden Deno gate.
 */
export function computeCombatReplay(input: {
  battleId: string;
  seed: string;
  attacker: FighterSnapshot;
  defender: FighterSnapshot;
}) {
  const replay = simulateBattle({
    battleId: input.battleId,
    seed: input.seed,
    attacker: input.attacker,
    defender: input.defender,
    rng: createSha256Rng(seedToKeyMaterial(input.seed)),
  });
  validateReplay(replay);
  verifyReplay(replay);
  return replay;
}

/** Assert the frozen golden fixture against the Edge-shipped vendored engine. */
export function runFrozenGoldenCombat() {
  const seed = deriveSeed(FROZEN_GOLDEN.seedContext);
  const replay = computeCombatReplay({
    battleId: FROZEN_GOLDEN.battleId,
    seed,
    attacker: FROZEN_GOLDEN.attacker,
    defender: FROZEN_GOLDEN.defender,
  });
  return replay;
}

export async function handleCombatRequest(req: Request, deps: CombatDeps): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method not allowed', code: 'method_not_allowed' }, 405);
  }

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
    const accountId = await deps.getUserId(authHeader);
    if (!accountId) {
      return json({ error: 'invalid or expired token', code: 'unauthenticated' }, 401);
    }

    const ctx = await deps.prepareFightContext(accountId, opponentId);
    if (!ctx || typeof ctx !== 'object' || !('ok' in ctx)) {
      return json({ error: 'malformed fight context', code: 'fight_context_invalid' }, 500);
    }

    if (!ctx.ok) {
      const status =
        ctx.code === 'allowance_exhausted'
          ? 409
          : ctx.code === 'unknown_opponent' || ctx.code === 'no_character'
            ? 404
            : ctx.code === 'unauthenticated' || ctx.code === 'forbidden'
              ? 401
              : 400;
      return json({ error: ctx.message, code: ctx.code }, status);
    }

    const battleId = (deps.createBattleId ?? (() => crypto.randomUUID()))();
    const seed = (deps.createBattleSeed ?? createBattleSeed)();
    const attacker = toSnapshot(ctx.attacker);
    const defender = toSnapshot(ctx.defender);

    const replay = computeCombatReplay({ battleId, seed, attacker, defender });

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
}
