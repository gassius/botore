/**
 * Deno Edge-runtime gate for F2 combat-v1.
 *
 * - Runs the shipped Edge handler + vendored pure packages under Deno
 * - Asserts the frozen golden checksum/events (not self-consistency)
 * - Exercises auth and eligibility failure paths through the handler
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FROZEN_GOLDEN,
  computeCombatReplay,
  handleCombatRequest,
  runFrozenGoldenCombat,
  type CombatDeps,
  type FightContext,
} from './handler.ts';

Deno.test('Edge vendored combat-v1 matches frozen golden checksum and events', () => {
  const replay = runFrozenGoldenCombat();
  assertEquals(replay.checksum, FROZEN_GOLDEN.checksum);
  assertEquals(replay.events.length, FROZEN_GOLDEN.eventCount);
  assertEquals(replay.outcome, FROZEN_GOLDEN.outcome);
  assertEquals(replay.events[0]?.type, 'battle_started');
  assertEquals(replay.events.at(-1)?.type, 'battle_ended');
  assertEquals(replay.rulesVersion, 'combat-v1');
});

Deno.test('computeCombatReplay seals via Edge-shipped validate/verify path', () => {
  const replay = runFrozenGoldenCombat();
  const again = computeCombatReplay({
    battleId: FROZEN_GOLDEN.battleId,
    seed: replay.seed,
    attacker: FROZEN_GOLDEN.attacker,
    defender: FROZEN_GOLDEN.defender,
  });
  assertEquals(again.checksum, FROZEN_GOLDEN.checksum);
  assertEquals(again.events.length, FROZEN_GOLDEN.eventCount);
});

function eligibleContext(): FightContext {
  return {
    ok: true,
    code: 'eligible',
    utcDay: '2026-11-08',
    allowancesRemaining: 2,
    rulesVersion: 'combat-v1',
    attacker: {
      ...FROZEN_GOLDEN.attacker,
      characterId: 'player-hero',
      displayName: 'Hero',
      loadoutVersionId: '0b3f7c9e-1111-4222-8333-944455566677',
      atlasVersion: 'v1',
    },
    defender: {
      ...FROZEN_GOLDEN.defender,
      characterId: 'opp-sir-bot',
      displayName: 'Sir Bot',
      loadoutVersionId: '0b3f7c9e-2222-4333-8444-955566677788',
      atlasVersion: 'v1',
    },
  };
}

Deno.test('handler rejects missing bearer token', async () => {
  const deps: CombatDeps = {
    getUserId: async () => '00000000-0000-4000-8000-000000000001',
    prepareFightContext: async () => eligibleContext(),
  };
  const res = await handleCombatRequest(
    new Request('http://local/combat-v1', {
      method: 'POST',
      body: JSON.stringify({ opponentId: 'opp-sir-bot' }),
    }),
    deps,
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, 'unauthenticated');
});

Deno.test('handler rejects invalid auth (getUser null)', async () => {
  const deps: CombatDeps = {
    getUserId: async () => null,
    prepareFightContext: async () => eligibleContext(),
  };
  const res = await handleCombatRequest(
    new Request('http://local/combat-v1', {
      method: 'POST',
      headers: { Authorization: 'Bearer bad', 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponentId: 'opp-sir-bot' }),
    }),
    deps,
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, 'unauthenticated');
});

Deno.test('handler maps eligibility failures (unknown opponent)', async () => {
  const deps: CombatDeps = {
    getUserId: async () => '00000000-0000-4000-8000-000000000001',
    prepareFightContext: async () => ({
      ok: false,
      code: 'unknown_opponent',
      message: 'unknown opponent: nope',
    }),
  };
  const res = await handleCombatRequest(
    new Request('http://local/combat-v1', {
      method: 'POST',
      headers: { Authorization: 'Bearer ok', 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponentId: 'nope' }),
    }),
    deps,
  );
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.code, 'unknown_opponent');
});

Deno.test('handler maps allowance exhausted', async () => {
  const deps: CombatDeps = {
    getUserId: async () => '00000000-0000-4000-8000-000000000001',
    prepareFightContext: async () => ({
      ok: false,
      code: 'allowance_exhausted',
      message: 'daily fight allowance exhausted',
      allowancesRemaining: 0,
    }),
  };
  const res = await handleCombatRequest(
    new Request('http://local/combat-v1', {
      method: 'POST',
      headers: { Authorization: 'Bearer ok', 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponentId: 'opp-sir-bot' }),
    }),
    deps,
  );
  assertEquals(res.status, 409);
});

Deno.test('handler computes durable replay on eligible context', async () => {
  const deps: CombatDeps = {
    getUserId: async () => '00000000-0000-4000-8000-000000000001',
    prepareFightContext: async () => eligibleContext(),
    createBattleId: () => '0b3f7c9e-1111-4222-8333-944455566677',
    createBattleSeed: () => 'ab'.repeat(32),
  };
  const res = await handleCombatRequest(
    new Request('http://local/combat-v1', {
      method: 'POST',
      headers: { Authorization: 'Bearer ok', 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponentId: 'opp-sir-bot' }),
    }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, 'computed');
  assertEquals(body.persistence, 'pending_f3');
  assertEquals(body.replay.rulesVersion, 'combat-v1');
  assertEquals(Array.isArray(body.replay.events) && body.replay.events.length > 0, true);
  assertEquals(typeof body.replay.checksum, 'string');
  assertEquals(body.replay.checksum.length, 64);
});

Deno.test('handler rejects empty opponentId without calling prepareFightContext', async () => {
  let prepared = false;
  const deps: CombatDeps = {
    getUserId: async () => '00000000-0000-4000-8000-000000000001',
    prepareFightContext: async () => {
      prepared = true;
      return eligibleContext();
    },
  };
  const res = await handleCombatRequest(
    new Request('http://local/combat-v1', {
      method: 'POST',
      headers: { Authorization: 'Bearer ok', 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponentId: '  ' }),
    }),
    deps,
  );
  assertEquals(res.status, 400);
  assertEquals(prepared, false);
  const body = await res.json();
  assertEquals(body.code, 'invalid_body');
});
