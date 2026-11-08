/**
 * Deno Edge-runtime gate for F2/F3 combat-v1.
 *
 * - Runs the shipped Edge handler + vendored pure packages under Deno
 * - Asserts the frozen golden checksum/events (not self-consistency)
 * - Exercises auth, eligibility, idempotency, and persist paths through the handler
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FROZEN_GOLDEN,
  computeCombatReplay,
  handleCombatRequest,
  runFrozenGoldenCombat,
  type CombatDeps,
  type FightContext,
  type PersistFightResult,
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

function okPersist(
  overrides: Partial<Extract<PersistFightResult, { ok: true }>> = {},
): PersistFightResult {
  return {
    ok: true,
    repeated: false,
    battleId: '0b3f7c9e-1111-4222-8333-944455566677',
    xpAwarded: 2,
    replayChecksum: 'b'.repeat(64),
    winnerId: 'player-hero',
    reason: 'defeat',
    allowancesRemaining: 1,
    ...overrides,
  };
}

function baseDeps(overrides: Partial<CombatDeps> = {}): CombatDeps {
  return {
    getUserId: async () => '00000000-0000-4000-8000-000000000001',
    prepareFightContext: async () => eligibleContext(),
    persistFightResult: async (args) =>
      okPersist({
        battleId: args.battleId,
        replayChecksum: (args.replay as { checksum?: string }).checksum ?? 'b'.repeat(64),
      }),
    createBattleId: () => '0b3f7c9e-1111-4222-8333-944455566677',
    createBattleSeed: () => 'ab'.repeat(32),
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://local/combat-v1', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ok',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'test-key-0001',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

Deno.test('handler rejects missing bearer token', async () => {
  const res = await handleCombatRequest(
    new Request('http://local/combat-v1', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'test-key-0001', 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponentId: 'opp-sir-bot' }),
    }),
    baseDeps(),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, 'unauthenticated');
});

Deno.test('handler rejects missing idempotency key', async () => {
  const res = await handleCombatRequest(
    new Request('http://local/combat-v1', {
      method: 'POST',
      headers: { Authorization: 'Bearer ok', 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponentId: 'opp-sir-bot' }),
    }),
    baseDeps(),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.code, 'invalid_idempotency_key');
});

Deno.test('handler rejects invalid auth (getUser null)', async () => {
  const res = await handleCombatRequest(
    post({ opponentId: 'opp-sir-bot' }),
    baseDeps({ getUserId: async () => null }),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, 'unauthenticated');
});

Deno.test('handler maps eligibility failures (unknown opponent)', async () => {
  const res = await handleCombatRequest(
    post({ opponentId: 'nope' }),
    baseDeps({
      prepareFightContext: async () => ({
        ok: false,
        code: 'unknown_opponent',
        message: 'unknown opponent: nope',
      }),
    }),
  );
  assertEquals(res.status, 404);
  const body = await res.json();
  assertEquals(body.code, 'unknown_opponent');
});

Deno.test('handler maps allowance exhausted', async () => {
  const res = await handleCombatRequest(
    post({ opponentId: 'opp-sir-bot' }),
    baseDeps({
      prepareFightContext: async () => ({
        ok: false,
        code: 'allowance_exhausted',
        message: 'daily fight allowance exhausted',
        allowancesRemaining: 0,
      }),
    }),
  );
  assertEquals(res.status, 409);
});

Deno.test('handler persists durable replay on eligible context', async () => {
  let persisted = false;
  const res = await handleCombatRequest(
    post({ opponentId: 'opp-sir-bot' }),
    baseDeps({
      persistFightResult: async (args) => {
        persisted = true;
        assertEquals(args.idempotencyKey, 'test-key-0001');
        assertEquals(args.opponentId, 'opp-sir-bot');
        return okPersist({
          battleId: args.battleId,
          replayChecksum: (args.replay as { checksum: string }).checksum,
          xpAwarded: 2,
          allowancesRemaining: 1,
        });
      },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(persisted, true);
  const body = await res.json();
  assertEquals(body.status, 'completed');
  assertEquals(body.persistence, 'persisted');
  assertEquals(body.repeated, false);
  assertEquals(body.xpAwarded, 2);
  assertEquals(body.replay.rulesVersion, 'combat-v1');
  assertEquals(Array.isArray(body.replay.events) && body.replay.events.length > 0, true);
  assertEquals(typeof body.replay.checksum, 'string');
  assertEquals(body.replay.checksum.length, 64);
  assertEquals(body.replayChecksum, body.replay.checksum);
});

Deno.test('handler returns repeated persistence without double side effects', async () => {
  const originalId = '0b3f7c9e-aaaa-4bbb-8ccc-ddddeeeeffff';
  const res = await handleCombatRequest(
    post({ opponentId: 'opp-sir-bot' }, { 'Idempotency-Key': 'retry-key-0001' }),
    baseDeps({
      createBattleId: () => '0b3f7c9e-1111-4222-8333-944455566677',
      persistFightResult: async () =>
        okPersist({
          repeated: true,
          battleId: originalId,
          replayChecksum: 'c'.repeat(64),
          xpAwarded: 1,
          allowancesRemaining: 2,
        }),
      loadPersistedReplay: async () => ({
        replayVersion: 1,
        rulesVersion: 'combat-v1',
        battleId: originalId,
        seed: 'cd'.repeat(32),
        inputHash: 'a'.repeat(64),
        fighters: [{}, {}],
        events: [{ type: 'battle_started' }, { type: 'battle_ended' }],
        outcome: { winner: 'opp-sir-bot', loser: 'player-hero', reason: 'defeat' },
        checksum: 'c'.repeat(64),
      }),
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.persistence, 'repeated');
  assertEquals(body.repeated, true);
  assertEquals(body.battleId, originalId);
  assertEquals(body.xpAwarded, 1);
  assertEquals(body.seed, 'cd'.repeat(32));
});

Deno.test('handler maps persist allowance exhausted after compute', async () => {
  const res = await handleCombatRequest(
    post({ opponentId: 'opp-sir-bot' }),
    baseDeps({
      persistFightResult: async () => ({
        ok: false,
        code: 'allowance_exhausted',
        message: 'daily fight allowance exhausted',
        allowancesRemaining: 0,
      }),
    }),
  );
  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.code, 'allowance_exhausted');
});

Deno.test('handler rejects empty opponentId without calling prepareFightContext', async () => {
  let prepared = false;
  const res = await handleCombatRequest(
    post({ opponentId: '  ' }),
    baseDeps({
      prepareFightContext: async () => {
        prepared = true;
        return eligibleContext();
      },
    }),
  );
  assertEquals(res.status, 400);
  assertEquals(prepared, false);
  const body = await res.json();
  assertEquals(body.code, 'invalid_body');
});
