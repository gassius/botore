import { describe, it, expect } from 'vitest';
import {
  type BattleReplay,
  canonicalJson,
  computeChecksum,
  sealReplay,
  validateReplay,
  verifyReplay,
  ReplayValidationError,
} from '../src/index.js';

function sampleEnvelope(): Omit<BattleReplay, 'checksum'> {
  return {
    replayVersion: 1,
    rulesVersion: 'combat-v1',
    battleId: 'b-123',
    seed: 'aabbccdd00112233aabbccdd00112233',
    inputHash: 'e'.repeat(64),
    fighters: [
      { characterId: 'c1', displayName: 'A', hp: 30, strength: 6, agility: 4, speed: 5, weaponKind: 'sword', weaponPower: 3 },
      { characterId: 'c2', displayName: 'B', hp: 28, strength: 5, agility: 6, speed: 4, weaponKind: 'dagger', weaponPower: 2 },
    ],
    events: [
      { seq: 0, type: 'battle_started', attacker: 'c1', defender: 'c2' },
      { seq: 1, type: 'turn_started', actor: 'c1' },
      { seq: 2, type: 'attack_selected', actor: 'c1', attack: 'weapon' },
      { seq: 3, type: 'damage_applied', target: 'c2', amount: 8, targetHpAfter: 20 },
      { seq: 4, type: 'battle_ended', winner: 'c1', reason: 'defeat' },
    ],
    outcome: { winner: 'c1', loser: 'c2', reason: 'defeat' },
  };
}

describe('replay package', () => {
  it('seals and verifies checksums', () => {
    const replay = sealReplay(sampleEnvelope());
    expect(() => verifyReplay(replay)).not.toThrow();
    const tampered = { ...replay, outcome: { ...replay.outcome, winner: 'c2' } };
    expect(() => verifyReplay(tampered as BattleReplay)).toThrow(ReplayValidationError);
  });

  it('checksum is order-stable under key reordering (canonical JSON)', () => {
    const env = sampleEnvelope();
    const reordered = JSON.parse(JSON.stringify(env)) as Record<string, unknown>;
    const keys = Object.keys(reordered).reverse();
    const rebuilt: Record<string, unknown> = {};
    for (const k of keys) rebuilt[k] = reordered[k];
    expect(canonicalJson(env)).toBe(canonicalJson(rebuilt));
    expect(computeChecksum(env)).toBe(computeChecksum(rebuilt as typeof env));
  });

  it('validates a well-formed replay', () => {
    const replay = sealReplay(sampleEnvelope());
    expect(() => validateReplay(JSON.parse(JSON.stringify(replay)))).not.toThrow();
  });

  it('rejects malformed payloads with precise issues', () => {
    expect(() => validateReplay('nope')).toThrow(ReplayValidationError);
    expect(() => validateReplay({})).toThrow(ReplayValidationError);
    const bad = sampleEnvelope() as unknown as Record<string, unknown>;
    bad['replayVersion'] = 99;
    bad['events'] = [];
    try {
      validateReplay(bad);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ReplayValidationError);
      const issues = (err as ReplayValidationError).issues.join(';');
      expect(issues).toContain('replayVersion');
      expect(issues).toContain('non-empty');
    }
  });

  it('enforces monotonic sequence numbers and event bookends', () => {
    const env = sampleEnvelope();
    const nonMonotonic = {
      ...env,
      events: [
        { seq: 0, type: 'battle_started' as const, attacker: 'c1', defender: 'c2' },
        { seq: 0, type: 'turn_started' as const, actor: 'c1' },
        { seq: 1, type: 'battle_ended' as const, winner: null, reason: 'defeat' as const },
      ],
    };
    try {
      validateReplay(nonMonotonic);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ReplayValidationError);
      expect((err as ReplayValidationError).issues.join(';')).toMatch(/monotonic/);
    }

    const noEnd = {
      ...env,
      events: env.events.filter((e) => e.type !== 'battle_ended'),
    };
    try {
      validateReplay(noEnd);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ReplayValidationError);
      expect((err as ReplayValidationError).issues.join(';')).toContain('battle_ended');
    }
  });
});
