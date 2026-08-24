/**
 * Combat v1 — deterministic, integer-only, seeded auto-battler.
 *
 * PURE PACKAGE: imports only @botore/{rng,replay}. No clocks, no
 * Math.random(), no IO, no framework code. Formulas are documented in
 * docs/architecture/combat-v1.md and mirrored in comments below.
 *
 * Rules version: "combat-v1" (frozen — see docs/adr/0005 before changing).
 */
import { type Rng } from '@botore/rng';
import {
  type BattleEvent,
  type BattleEventDraft,
  type BattleOutcome,
  type BattleReplay,
  type FighterSnapshot,
  REPLAY_VERSION,
  computeChecksum,
  computeInputHash,
} from '@botore/replay';

export const RULES_VERSION = 'combat-v1';
export const MAX_ACTIONS = 100;

// --- Integer formulas (see docs/architecture/combat-v1.md) -----------------

/** Initiative for one turn: speed + seeded variance in [0, 3]. */
function initiative(rng: Rng, speed: number): number {
  return speed + rng.nextIntInRange(0, 3);
}

const BASE_HIT_CHANCE = 75;
const DODGE_PER_AGILITY_DELTA = 4;
const HIT_CHANCE_FLOOR = 25;
const HIT_CHANCE_CEILING = 95;

/**
 * Hit chance percent: 75 base, shifted by (defender.agility - attacker.agility)
 * × 4, clamped to [25, 95]. Integer only.
 */
function hitChance(attackerAgility: number, defenderAgility: number): number {
  const chance = BASE_HIT_CHANCE - (defenderAgility - attackerAgility) * DODGE_PER_AGILITY_DELTA;
  if (chance < HIT_CHANCE_FLOOR) return HIT_CHANCE_FLOOR;
  if (chance > HIT_CHANCE_CEILING) return HIT_CHANCE_CEILING;
  return chance;
}

/** Weapon attacks are chosen with this probability (percent out of 100). */
const WEAPON_ATTACK_PERCENT = 40;

/** Basic attack power is half the weapon power (integer truncation). */
function basicPower(weaponPower: number): number {
  return Math.trunc(weaponPower / 2);
}

/** Damage: strength + weapon value + bounded variance [0..4]; roll 0 → glancing (half damage). */
function damageRoll(rng: Rng, strength: number, weaponValue: number): number {
  const variance = rng.nextIntInRange(0, 4);
  const glancing = rng.nextIntInRange(0, 4) === 0;
  const raw = strength + weaponValue + variance;
  return glancing ? Math.trunc(raw / 2) : raw;
}

interface ActorState {
  readonly snapshot: FighterSnapshot;
  hp: number; // current HP, floor at 0
}

export interface SimulateInput {
  readonly battleId: string;
  readonly seed: string;
  readonly rulesVersion?: string;
  readonly attacker: FighterSnapshot;
  readonly defender: FighterSnapshot;
  /** Pre-seeded PRNG instance (created by caller via seedToKeyMaterial + createSha256Rng). */
  readonly rng: Rng;
}

/**
 * Runs the battle to completion. Deterministic: identical inputs — including
 * PRNG algorithm version and initial state — produce a byte-stable event
 * stream, outcome, and checksum.
 */
export function simulateBattle(input: SimulateInput): BattleReplay {
  const { battleId, seed, attacker, defender, rng } = input;
  const rulesVersion = input.rulesVersion ?? RULES_VERSION;

  const actors: Record<'a' | 'b', ActorState> = {
    a: { snapshot: attacker, hp: attacker.hp },
    b: { snapshot: defender, hp: defender.hp },
  };

  const events: BattleEvent[] = [];
  let seq = 0;
  const emit = (ev: BattleEventDraft): void => {
    events.push({ ...ev, seq } as BattleEvent);
    seq += 1;
  };

  emit({ type: 'battle_started', attacker: attacker.characterId, defender: defender.characterId });

  let actions = 0;
  let defeatedId: string | null = null;

  while (actions < MAX_ACTIONS && defeatedId === null) {
    // Initiative phase: both actors draw; higher acts first this round.
    // Exact tie resolves toward the nominal attacker (deterministic).
    const initA = initiative(rng, attacker.speed);
    const initB = initiative(rng, defender.speed);
    const order: readonly ('a' | 'b')[] = initA >= initB ? ['a', 'b'] : ['b', 'a'];

    for (const actorKey of order) {
      if (defeatedId !== null || actions >= MAX_ACTIONS) break;
      const self = actors[actorKey];
      const foeKey: 'a' | 'b' = actorKey === 'a' ? 'b' : 'a';
      const foe = actors[foeKey];

      emit({ type: 'turn_started', actor: self.snapshot.characterId });
      actions += 1;

      // Attack selection: single uniform draw decides weapon vs basic.
      const usesWeapon = rng.nextInt(100) < WEAPON_ATTACK_PERCENT;
      emit({
        type: 'attack_selected',
        actor: self.snapshot.characterId,
        attack: usesWeapon ? 'weapon' : 'basic',
      });

      // Hit/dodge resolution: agility-delta formula vs uniform roll.
      const chance = hitChance(self.snapshot.agility, foe.snapshot.agility);
      const roll = rng.nextInt(100);
      if (roll >= chance) {
        emit({ type: 'dodged', actor: foe.snapshot.characterId });
        continue;
      }

      const weaponValue = usesWeapon
        ? self.snapshot.weaponPower
        : basicPower(self.snapshot.weaponPower);
      const dmg = damageRoll(rng, self.snapshot.strength, weaponValue);
      const newHp = Math.max(0, foe.hp - dmg); // HP never below zero
      foe.hp = newHp;
      emit({
        type: 'damage_applied',
        target: foe.snapshot.characterId,
        amount: dmg,
        targetHpAfter: newHp,
      });

      if (newHp === 0) {
        defeatedId = foe.snapshot.characterId;
        emit({ type: 'character_defeated', characterId: defeatedId });
        break;
      }
    }
  }

  let outcome: BattleOutcome;
  if (defeatedId !== null) {
    const winner =
      defeatedId === attacker.characterId ? defender.characterId : attacker.characterId;
    emit({ type: 'battle_ended', winner, reason: 'defeat' });
    outcome = { winner, loser: defeatedId, reason: 'defeat' };
  } else {
    // Action cap: higher remaining HP percentage wins; exact equality stays a draw.
    const hpFracA = (actors.a.hp * 100) / Math.max(1, attacker.hp);
    const hpFracB = (actors.b.hp * 100) / Math.max(1, defender.hp);
    let tiebreakWinner: string | null = null;
    if (hpFracA > hpFracB) tiebreakWinner = attacker.characterId;
    else if (hpFracB > hpFracA) tiebreakWinner = defender.characterId;
    emit({ type: 'battle_ended', winner: tiebreakWinner, reason: 'action_limit_tiebreak' });
    outcome = {
      winner: null,
      loser: null,
      reason: 'action_limit_tiebreak',
      winnerByTiebreak: tiebreakWinner,
    };
  }

  const fighters: [FighterSnapshot, FighterSnapshot] = [attacker, defender];
  const inputHash = computeInputHash(fighters);
  const envelope = {
    replayVersion: REPLAY_VERSION,
    rulesVersion,
    battleId,
    seed,
    inputHash,
    fighters,
    events,
    outcome,
  };
  return Object.freeze({ ...envelope, checksum: computeChecksum(envelope) });
}
