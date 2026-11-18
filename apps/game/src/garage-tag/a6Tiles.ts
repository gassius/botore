/**
 * A6 carousel tile + opponent panel asset map (Botore-A6-patterns-tott-v1).
 * Metro needs static require() paths — keep this file as the single import surface.
 */
import type { ImageSourcePropType } from 'react-native';

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

export type A6WeaponTileId =
  | 'sword'
  | 'axe'
  | 'dagger'
  | 'mace'
  | 'hammer'
  | 'spear'
  | 'shield';

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

const paintTiles: Record<A6PaintTileId, Record<A6TileState, ImageSourcePropType>> = {
  oxide: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/oxide-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/oxide-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/oxide-locked.png'),
  },
  petrol: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/petrol-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/petrol-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/petrol-locked.png'),
  },
  primer: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/primer-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/primer-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/primer-locked.png'),
  },
  ink: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/ink-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/ink-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/ink-locked.png'),
  },
  drab: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/drab-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/drab-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/drab-locked.png'),
  },
  cobalt: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/cobalt-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/cobalt-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/cobalt-locked.png'),
  },
  frost: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/frost-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/frost-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/frost-locked.png'),
  },
  cinder: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/cinder-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/cinder-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/cinder-locked.png'),
  },
  hazard: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/hazard-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/hazard-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/hazard-locked.png'),
  },
  racing: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/racing-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/racing-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-paint/racing-locked.png'),
  },
};

const weaponTiles: Record<A6WeaponTileId, Record<A6TileState, ImageSourcePropType>> = {
  sword: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/sword-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/sword-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/sword-locked.png'),
  },
  axe: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/axe-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/axe-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/axe-locked.png'),
  },
  dagger: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/dagger-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/dagger-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/dagger-locked.png'),
  },
  mace: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/mace-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/mace-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/mace-locked.png'),
  },
  hammer: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/hammer-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/hammer-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/hammer-locked.png'),
  },
  spear: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/spear-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/spear-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/spear-locked.png'),
  },
  shield: {
    default: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/shield-default.png'),
    selected: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/shield-selected.png'),
    locked: require('../../assets/a6-patterns-tott-v1/tiles/tile-weapon/shield-locked.png'),
  },
};

const opponentPanels: Record<A6OpponentNpcId, ImageSourcePropType> = {
  'rivet-nan': require('../../assets/a6-patterns-tott-v1/opponents/rivet-nan.png'),
  'boiler-joe': require('../../assets/a6-patterns-tott-v1/opponents/boiler-joe.png'),
  'can-hook': require('../../assets/a6-patterns-tott-v1/opponents/can-hook.png'),
  'slab-mick': require('../../assets/a6-patterns-tott-v1/opponents/slab-mick.png'),
  'ink-pip': require('../../assets/a6-patterns-tott-v1/opponents/ink-pip.png'),
  'drab-hank': require('../../assets/a6-patterns-tott-v1/opponents/drab-hank.png'),
  'frost-kit': require('../../assets/a6-patterns-tott-v1/opponents/frost-kit.png'),
  'cobalt-brute': require('../../assets/a6-patterns-tott-v1/opponents/cobalt-brute.png'),
  'primer-peg': require('../../assets/a6-patterns-tott-v1/opponents/primer-peg.png'),
  'petrol-gus': require('../../assets/a6-patterns-tott-v1/opponents/petrol-gus.png'),
  'cinder-cal': require('../../assets/a6-patterns-tott-v1/opponents/cinder-cal.png'),
  'weld-tess': require('../../assets/a6-patterns-tott-v1/opponents/weld-tess.png'),
};

export function a6PaintTileSource(
  id: string,
  state: A6TileState,
): ImageSourcePropType | null {
  const key = id as A6PaintTileId;
  return paintTiles[key]?.[state] ?? null;
}

export function a6WeaponTileSource(
  id: string,
  state: A6TileState,
): ImageSourcePropType | null {
  const key = id as A6WeaponTileId;
  return weaponTiles[key]?.[state] ?? null;
}

export function a6OpponentPanelSource(id: string): ImageSourcePropType | null {
  const key = id as A6OpponentNpcId;
  return opponentPanels[key] ?? null;
}

/** Map player-facing / DEV display names onto A6 NPC panel ids when possible. */
export function resolveOpponentNpcId(displayName: string): A6OpponentNpcId | null {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if ((A6_OPPONENT_NPC_IDS as readonly string[]).includes(slug)) {
    return slug as A6OpponentNpcId;
  }
  // DEV roster aliases until live NPC names land.
  const aliases: Record<string, A6OpponentNpcId> = {
    'sir-bot': 'slab-mick',
    'dex-bot': 'ink-pip',
    'tank-bot': 'cobalt-brute',
    'hp-bot': 'cobalt-brute',
  };
  return aliases[slug] ?? null;
}
