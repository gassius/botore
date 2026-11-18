/**
 * Pure A6 opponent panel matching — no Metro asset requires (safe for vitest).
 */

import type { A6OpponentNpcId, A6PaintTileId, A6WeaponTileId } from './a6TilesIds';
import { A6_OPPONENT_NPC_IDS } from './a6TilesIds';

export type A6OpponentBake = {
  readonly paint: A6PaintTileId;
  readonly weapon: A6WeaponTileId;
};

/** A5/A6 baked paint + weapon per NPC panel (a5fix/npcs.json). */
export const A6_OPPONENT_BAKES: Readonly<Record<A6OpponentNpcId, A6OpponentBake>> = {
  'rivet-nan': { paint: 'oxide', weapon: 'sword' },
  'boiler-joe': { paint: 'petrol', weapon: 'hammer' },
  'can-hook': { paint: 'primer', weapon: 'spear' },
  'slab-mick': { paint: 'cinder', weapon: 'mace' },
  'ink-pip': { paint: 'ink', weapon: 'dagger' },
  'drab-hank': { paint: 'drab', weapon: 'axe' },
  'frost-kit': { paint: 'frost', weapon: 'sword' },
  'cobalt-brute': { paint: 'cobalt', weapon: 'mace' },
  'primer-peg': { paint: 'primer', weapon: 'dagger' },
  'petrol-gus': { paint: 'petrol', weapon: 'spear' },
  'cinder-cal': { paint: 'cinder', weapon: 'axe' },
  'weld-tess': { paint: 'oxide', weapon: 'mace' },
};

function slugifyNpcKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Exact A6 NPC id only — no display-name aliases onto a different robot. */
export function resolveOpponentNpcId(characterIdOrName: string): A6OpponentNpcId | null {
  const slug = slugifyNpcKey(characterIdOrName);
  if ((A6_OPPONENT_NPC_IDS as readonly string[]).includes(slug)) {
    return slug as A6OpponentNpcId;
  }
  return null;
}

function normalizePaintKey(paint: string): string {
  const raw = paint.trim().toLowerCase();
  return raw.startsWith('paint-') ? raw.slice('paint-'.length) : raw;
}

function normalizeWeaponKey(weapon: string): string {
  const raw = weapon.trim().toLowerCase();
  return raw.startsWith('weapon-') ? raw.slice('weapon-'.length) : raw;
}

/** True when catalogue / loadout paint+weapon match the baked A6 NPC panel. */
export function a6NpcLoadoutMatchesBake(
  paint: string,
  weapon: string,
  bake: A6OpponentBake,
): boolean {
  return normalizePaintKey(paint) === bake.paint && normalizeWeaponKey(weapon) === bake.weapon;
}

/** Exact id + bake match — callers resolve the panel ImageSource separately. */
export function matchA6OpponentPanelId(input: {
  readonly characterId: string;
  readonly displayName: string;
  readonly paint: string;
  readonly weapon: string;
}): A6OpponentNpcId | null {
  const npcId = resolveOpponentNpcId(input.characterId) ?? resolveOpponentNpcId(input.displayName);
  if (!npcId) return null;
  const bake = A6_OPPONENT_BAKES[npcId];
  if (!a6NpcLoadoutMatchesBake(input.paint, input.weapon, bake)) return null;
  return npcId;
}
