import { describe, expect, it } from 'vitest';
import { DevFightRequestAdapter } from '../src/fight/request/DevFightRequestAdapter';
import {
  createFightIdempotencyKey,
  isValidIdempotencyKey,
  resolveFightIntent,
} from '../src/fight/request/idempotency';
import { DevOpponentCandidatesAdapter } from '../src/fight/candidates/DevOpponentCandidatesAdapter';
import { parseCombatSuccess } from '../src/fight/request/parseCombatResponse';

describe('fight idempotency keys', () => {
  it('creates keys accepted by combat-v1 length rules', () => {
    const key = createFightIdempotencyKey();
    expect(isValidIdempotencyKey(key)).toBe(true);
    expect(key.startsWith('fight-')).toBe(true);
  });

  it('reuses intent for the same opponent (double-tap / retry)', () => {
    const first = resolveFightIntent(null, 'opp-sir-bot');
    const second = resolveFightIntent(first, 'opp-sir-bot');
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    const rematch = resolveFightIntent(first, 'opp-dex-bot');
    expect(rematch.idempotencyKey).not.toBe(first.idempotencyKey);
  });
});

describe('DevFightRequestAdapter F3 semantics', () => {
  it('does not double-spend allowance on same Idempotency-Key', async () => {
    const fights = new DevFightRequestAdapter();
    fights.allowancesRemaining = 2;
    const key = createFightIdempotencyKey();

    const first = await fights.requestFight({
      accessToken: 'dev-token',
      opponentId: 'opp-sir-bot',
      idempotencyKey: key,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.fight.repeated).toBe(false);
    expect(first.fight.allowancesRemaining).toBe(1);
    expect(fights.allowancesRemaining).toBe(1);

    const retry = await fights.requestFight({
      accessToken: 'dev-token',
      opponentId: 'opp-sir-bot',
      idempotencyKey: key,
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.fight.repeated).toBe(true);
    expect(retry.fight.battleId).toBe(first.fight.battleId);
    expect(retry.fight.allowancesRemaining).toBe(1);
    expect(fights.allowancesRemaining).toBe(1);
  });

  it('surfaces allowance_exhausted without inventing REF costs', async () => {
    const fights = new DevFightRequestAdapter();
    fights.forceAllowanceExhausted = true;
    const result = await fights.requestFight({
      accessToken: 'dev-token',
      opponentId: 'opp-sir-bot',
      idempotencyKey: createFightIdempotencyKey(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('allowance_exhausted');
    expect(result.allowancesRemaining).toBe(0);
  });
});

describe('DevOpponentCandidatesAdapter states', () => {
  it('reports empty / network / no-allowance clearly', async () => {
    const port = new DevOpponentCandidatesAdapter();
    port.forceEmpty = true;
    const empty = await port.listCandidates({
      accessToken: 't',
      accountId: '00000000-0000-4000-8000-000000000001',
    });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.candidates).toHaveLength(0);

    port.forceEmpty = false;
    port.forceNetworkError = true;
    const net = await port.listCandidates({
      accessToken: 't',
      accountId: '00000000-0000-4000-8000-000000000001',
    });
    expect(net.ok).toBe(false);
    if (!net.ok) expect(net.code).toBe('network_error');

    port.forceNetworkError = false;
    port.allowancesRemaining = 0;
    const elig = await port.prepareEligibility({
      accessToken: 't',
      accountId: '00000000-0000-4000-8000-000000000001',
      opponentId: 'opp-sir-bot',
    });
    expect(elig.ok).toBe(false);
    if (!elig.ok) expect(elig.code).toBe('allowance_exhausted');
  });
});

describe('parseCombatSuccess', () => {
  it('maps combat-v1 payload including xpAwarded from backend only', () => {
    const fight = parseCombatSuccess(
      {
        battleId: 'b1',
        rulesVersion: 'combat-v1',
        seed: 'aa',
        outcome: { winner: 'player-hero', reason: 'defeat' },
        replay: { events: [] },
        replayChecksum: 'c',
        xpAwarded: 7,
        allowancesRemaining: 2,
        utcDay: '2026-11-09',
        repeated: false,
        persistence: 'persisted',
        loadoutVersionIds: { attacker: 'a', defender: 'd' },
        atlasVersions: { attacker: 'v1', defender: 'v1' },
      },
      { opponentId: 'opp-sir-bot', idempotencyKey: 'fight-key-123456' },
    );
    expect(fight).not.toBeNull();
    expect(fight?.xpAwarded).toBe(7);
    expect(fight?.opponentId).toBe('opp-sir-bot');
  });
});
