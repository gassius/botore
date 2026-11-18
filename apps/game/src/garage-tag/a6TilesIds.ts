/** A6 id unions — no Metro asset requires (safe for vitest / pure match). */

export type A6PaintTileId =
  | 'oxide'
  | 'petrol'
  | 'primer'
  | 'ink'
  | 'drab'
  | 'cobalt'
  | 'frost'
  | 'cinder'
  | 'hazard'
  | 'racing';

export type A6WeaponTileId = 'sword' | 'axe' | 'dagger' | 'mace' | 'hammer' | 'spear' | 'shield';

export type A6TileState = 'default' | 'selected' | 'locked';

export type A6OpponentNpcId =
  | 'rivet-nan'
  | 'boiler-joe'
  | 'can-hook'
  | 'slab-mick'
  | 'ink-pip'
  | 'drab-hank'
  | 'frost-kit'
  | 'cobalt-brute'
  | 'primer-peg'
  | 'petrol-gus'
  | 'cinder-cal'
  | 'weld-tess';

export const A6_PAINT_TILE_IDS: readonly A6PaintTileId[] = [
  'oxide',
  'petrol',
  'primer',
  'ink',
  'drab',
  'cobalt',
  'frost',
  'cinder',
  'hazard',
  'racing',
] as const;

export const A6_WEAPON_TILE_IDS: readonly A6WeaponTileId[] = [
  'sword',
  'axe',
  'dagger',
  'mace',
  'hammer',
  'spear',
  'shield',
] as const;

export const A6_OPPONENT_NPC_IDS: readonly A6OpponentNpcId[] = [
  'rivet-nan',
  'boiler-joe',
  'can-hook',
  'slab-mick',
  'ink-pip',
  'drab-hank',
  'frost-kit',
  'cobalt-brute',
  'primer-peg',
  'petrol-gus',
  'cinder-cal',
  'weld-tess',
] as const;
