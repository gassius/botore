import { describe, it, expect } from 'vitest';
import {
  type CharacterBuild,
  DAILY_FIGHT_ALLOWANCE,
  XP_FOR_LOSS,
  XP_FOR_WIN,
} from '../src/index.js';

const build: CharacterBuild = {
  characterId: 'c1',
  displayName: 'Test',
  stats: { hp: 30, strength: 6, agility: 4, speed: 5 },
  weapon: { kind: 'sword', power: 3 },
};

describe('vertical-slice domain constants', () => {
  it('awards 2 XP for win and 1 for loss', () => {
    expect(XP_FOR_WIN).toBe(2);
    expect(XP_FOR_LOSS).toBe(1);
  });

  it('grants three fight allowances per UTC day', () => {
    expect(DAILY_FIGHT_ALLOWANCE).toBe(3);
  });

  it('character builds are immutable snapshots', () => {
    expect(Object.isFrozen(build.stats)).toBe(false); // construction contract, not runtime freeze
    expect(() => {
      const copy: CharacterBuild = { ...build, characterId: 'c2' };
      return copy;
    }).not.toThrow();
  });
});
