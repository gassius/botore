import { describe, it, expect } from 'vitest';
import { SEEDED_OPPONENTS, goldenBattle, runGoldenBattle, DEFAULT_PLAYER } from '../src/index.js';
import { verifyReplay } from '@botore/replay';

describe('test fixtures', () => {
  it('provides exactly three seeded opponents', () => {
    expect(SEEDED_OPPONENTS).toHaveLength(3);
    for (const o of SEEDED_OPPONENTS) {
      expect(o.characterId).toMatch(/^opp-/);
      expect(o.hp).toBeGreaterThan(0);
    }
  });

  it('golden battles are stable across executions and verify', () => {
    for (const idx of [0, 1, 2]) {
      const fx = goldenBattle(idx);
      const r1 = runGoldenBattle(fx);
      const r2 = runGoldenBattle(fx);
      expect(r1.checksum).toBe(r2.checksum);
      expect(() => verifyReplay(r1)).not.toThrow();
    }
  });

  it('default player differs from every opponent', () => {
    for (const o of SEEDED_OPPONENTS) {
      expect(DEFAULT_PLAYER.characterId).not.toBe(o.characterId);
    }
  });
});
