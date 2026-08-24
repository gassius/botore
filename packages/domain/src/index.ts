/**
 * Domain entities and policies for the vertical slice.
 *
 * PURE PACKAGE — entities are immutable snapshots; progression is an
 * append-only policy. No IO of any kind.
 */

/** Weapon kinds available in combat v1. Exactly one per character. */
export type WeaponKind = 'sword' | 'axe' | 'dagger';

export interface Weapon {
  readonly kind: WeaponKind;
  /** Flat integer damage contribution. */
  readonly power: number;
}

export interface CharacterStats {
  readonly hp: number;
  readonly strength: number;
  readonly agility: number;
  readonly speed: number;
}

/**
 * Immutable combat build: everything the engine needs about one fighter.
 * `characterId`/`displayName` identify; stats decide.
 */
export interface CharacterBuild {
  readonly characterId: string;
  readonly displayName: string;
  readonly stats: CharacterStats;
  readonly weapon: Weapon;
}

export const XP_FOR_WIN = 2;
export const XP_FOR_LOSS = 1;

/** Daily fight allowance per account (UTC day). */
export const DAILY_FIGHT_ALLOWANCE = 3;

export function totalXp(levelXpEntries: readonly number[]): number {
  return levelXpEntries.reduce((sum, xp) => sum + xp, 0);
}
