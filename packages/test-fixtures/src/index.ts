/**
 * Golden battle fixtures: builders, seeds, and expected outcomes shared by
 * engine tests, API integration tests, and the Cocos replay adapter.
 *
 * Fixtures are FROZEN artifacts — regenerate deliberately (script below),
 * never accidentally.
 */
import { createSha256Rng, deriveSeed, seedToKeyMaterial } from '@botore/rng';
import { type FighterSnapshot } from '@botore/replay';
import { simulateBattle } from '@botore/combat-engine';

/** The three seeded opponents served by GET /v1/opponents. */
export const SEEDED_OPPONENTS: readonly FighterSnapshot[] = [
  {
    characterId: 'opp-sir-bot',
    displayName: 'Sir Bot',
    hp: 34,
    strength: 6,
    agility: 4,
    speed: 5,
    weaponKind: 'sword',
    weaponPower: 3,
  },
  {
    characterId: 'opp-dex-bot',
    displayName: 'Dex Bot',
    hp: 26,
    strength: 4,
    agility: 7,
    speed: 8,
    weaponKind: 'dagger',
    weaponPower: 2,
  },
  {
    characterId: 'opp-hp-bot',
    displayName: 'Tank Bot',
    hp: 44,
    strength: 8,
    agility: 2,
    speed: 3,
    weaponKind: 'axe',
    weaponPower: 5,
  },
] as const;

export const DEFAULT_PLAYER: FighterSnapshot = {
  characterId: 'player-hero',
  displayName: 'Hero',
  hp: 30,
  strength: 5,
  agility: 5,
  speed: 6,
  weaponKind: 'sword',
  weaponPower: 3,
};

export interface GoldenBattleFixture {
  readonly battleId: string;
  readonly seed: string;
  readonly attacker: FighterSnapshot;
  readonly defender: FighterSnapshot;
}

export function goldenBattle(index: number): GoldenBattleFixture {
  const defender = SEEDED_OPPONENTS[index % SEEDED_OPPONENTS.length];
  if (!defender) throw new Error(`no opponent fixture for index ${index}`);
  return {
    battleId: `golden-${index}`,
    seed: deriveSeed(`botore/golden/${index}`),
    attacker: DEFAULT_PLAYER,
    defender,
  };
}

/** Re-runs a fixture; used by tests to assert cross-execution stability. */
export function runGoldenBattle(fixture: GoldenBattleFixture) {
  return simulateBattle({
    battleId: fixture.battleId,
    seed: fixture.seed,
    attacker: fixture.attacker,
    defender: fixture.defender,
    rng: createSha256Rng(seedToKeyMaterial(fixture.seed)),
  });
}
