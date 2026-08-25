import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createSha256Rng, deriveSeed, seedToKeyMaterial } from '@botore/rng';
import { type FighterSnapshot, verifyReplay, validateReplay } from '@botore/replay';
import { MAX_ACTIONS, RULES_VERSION, simulateBattle } from '../src/index.js';

export function fixture(name: string): FighterSnapshot {
  const presets: Record<string, FighterSnapshot> = {
    knight: {
      characterId: 'knight',
      displayName: 'Sir Bot',
      hp: 34,
      strength: 6,
      agility: 4,
      speed: 5,
      weaponKind: 'sword',
      weaponPower: 3,
    },
    rogue: {
      characterId: 'rogue',
      displayName: 'Dex Bot',
      hp: 26,
      strength: 4,
      agility: 7,
      speed: 8,
      weaponKind: 'dagger',
      weaponPower: 2,
    },
    brute: {
      characterId: 'brute',
      displayName: 'HP Bot',
      hp: 44,
      strength: 8,
      agility: 2,
      speed: 3,
      weaponKind: 'axe',
      weaponPower: 5,
    },
  };
  const f = presets[name];
  if (!f) throw new Error(`unknown fixture ${name}`);
  return f;
}

function run(battleId: string, seedHex: string, a: FighterSnapshot, b: FighterSnapshot) {
  return simulateBattle({
    battleId,
    seed: seedHex,
    attacker: a,
    defender: b,
    rng: createSha256Rng(seedToKeyMaterial(seedHex)),
  });
}

describe('combat v1 — determinism', () => {
  it('golden fixture: byte-stable events + outcome (frozen vector)', () => {
    // FROZEN. Any diff means rules/PRNG changed → new rulesVersion required.
    const replay = run(
      'b-golden-1',
      deriveSeed('botore/golden/1'),
      fixture('knight'),
      fixture('rogue'),
    );
    const summary = {
      outcome: replay.outcome,
      checksum: replay.checksum,
      eventCount: replay.events.length,
      lastDamage: replay.events.filter((e) => e.type === 'damage_applied').at(-1),
    };
    expect(summary).toMatchSnapshot();
  });

  it('same inputs produce identical checksums (isolated executions)', () => {
    // Two isolated RNG instances — equivalent to separate process executions
    // because no state escapes the engine.
    const seed = deriveSeed('botore/repeat/1');
    const a = run('b-1', seed, fixture('brute'), fixture('rogue'));
    const b = run('b-1', seed, fixture('brute'), fixture('rogue'));
    expect(a.checksum).toBe(b.checksum);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a).toEqual(b);
  });

  it('different seeds diverge (sanity)', () => {
    const r1 = run('b-1', deriveSeed('s1'), fixture('knight'), fixture('rogue'));
    const r2 = run('b-1', deriveSeed('s2'), fixture('knight'), fixture('rogue'));
    expect(r1.checksum).not.toBe(r2.checksum);
  });
});

describe('combat v1 — invariants (property tests)', () => {
  const arbFighter = (id: string) =>
    fc.record({
      characterId: fc.constant(id),
      displayName: fc.constant(id),
      hp: fc.integer({ min: 5, max: 60 }),
      strength: fc.integer({ min: 1, max: 12 }),
      agility: fc.integer({ min: 1, max: 12 }),
      speed: fc.integer({ min: 1, max: 12 }),
      weaponKind: fc.constantFrom('sword', 'axe', 'dagger'),
      weaponPower: fc.integer({ min: 1, max: 6 }),
    }) as fc.Arbitrary<FighterSnapshot>;

  const arbBattle = fc
    .string({ minLength: 8, maxLength: 60 })
    .map((s) =>
      Array.from({ length: 32 }, (_, i) =>
        ((s.charCodeAt(i % s.length) + i) % 16).toString(16),
      ).join(''),
    )
    .chain((seed) =>
      fc.record({
        seed: fc.constant(seed),
        a: arbFighter('fa'),
        b: arbFighter('fb'),
      }),
    );

  it('property: always terminates within MAX_ACTIONS and HP stays bounded', () => {
    fc.assert(
      fc.property(arbBattle, ({ seed, a, b }) => {
        const replay = run('b-prop', seed, a, b);
        const damages = replay.events.filter((e) => e.type === 'damage_applied');
        const turns = replay.events.filter((e) => e.type === 'turn_started').length;
        if (turns > MAX_ACTIONS) return false; // action bound respected
        for (const d of damages) {
          if (!Number.isInteger(d.amount) || d.amount < 0) return false;
          if (d.targetHpAfter < 0 || d.targetHpAfter > Math.max(a.hp, b.hp)) return false;
        }
        return replay.events[replay.events.length - 1]?.type === 'battle_ended';
      }),
      { numRuns: 300 },
    );
  });

  it('property: identical repeat execution is byte-stable', () => {
    fc.assert(
      fc.property(arbBattle, ({ seed, a, b }) => {
        const r1 = run('bx', seed, a, b);
        const r2 = run('bx', seed, a, b);
        return JSON.stringify(r1) === JSON.stringify(r2);
      }),
      { numRuns: 150 },
    );
  });

  it('property: every produced replay passes schema validation and verifies', () => {
    fc.assert(
      fc.property(arbBattle, ({ seed, a, b }) => {
        const replay = run('bv', seed, a, b);
        try {
          validateReplay(JSON.parse(JSON.stringify(replay)));
          verifyReplay(replay);
          return true;
        } catch {
          return false;
        }
      }),
      { numRuns: 200 },
    );
  });

  it(`property: rules version is ${RULES_VERSION} and defeat happens at most once`, () => {
    fc.assert(
      fc.property(arbBattle, ({ seed, a, b }) => {
        const replay = run('br', seed, a, b);
        if (replay.rulesVersion !== RULES_VERSION) return false;
        const defeats = replay.events.filter((e) => e.type === 'character_defeated').length;
        return defeats <= 1;
      }),
      { numRuns: 200 },
    );
  });
});
