import type { GarageLoadout } from './loadoutTypes';
import type { WeaponGlyphId } from '../../garage-tag';

/**
 * Seeded proof catalogue ids from F1 (1001_seed_bots_as_data).
 * No catalogue expansion — Oxide/Petrol UI aliases map onto crimson/cobalt.
 */
export const PROOF_CHARACTER_ID = 'player-hero';
export const PROOF_ATLAS_VERSION = 'v1';

export const PROOF_PAINTS = [
  {
    partId: 'paint-crimson',
    label: 'Oxide',
    uiAlias: 'oxide' as const,
  },
  {
    partId: 'paint-cobalt',
    label: 'Petrol',
    uiAlias: 'petrol' as const,
  },
] as const;

export const PROOF_WEAPONS = [
  { partId: 'weapon-sword', label: 'Sword', uiAlias: 'sword' as const },
  { partId: 'weapon-axe', label: 'Axe', uiAlias: 'axe' as const },
  { partId: 'weapon-dagger', label: 'Dagger', uiAlias: 'dagger' as const },
] as const;

export const DEFAULT_CONFIRMED_LOADOUT: GarageLoadout = {
  chassis: 'chassis-basic',
  paint: 'paint-crimson',
  weapon: 'weapon-sword',
  shield: null,
  drone: null,
  decals: [],
  soundTags: ['chassis.light', 'weapon.sword'],
};

export function paintCatalogueId(aliasOrId: string): string {
  if (aliasOrId === 'oxide') return 'paint-crimson';
  if (aliasOrId === 'petrol') return 'paint-cobalt';
  return aliasOrId;
}

export function paintUiAlias(paintId: string): 'oxide' | 'petrol' | string {
  if (paintId === 'paint-crimson' || paintId === 'oxide') return 'oxide';
  if (paintId === 'paint-cobalt' || paintId === 'petrol') return 'petrol';
  return paintId;
}

export function weaponCatalogueId(aliasOrId: string): string {
  if (aliasOrId === 'sword') return 'weapon-sword';
  if (aliasOrId === 'axe') return 'weapon-axe';
  if (aliasOrId === 'dagger') return 'weapon-dagger';
  return aliasOrId;
}

export function weaponUiAlias(weaponId: string): WeaponGlyphId {
  if (weaponId === 'weapon-axe' || weaponId === 'axe') return 'axe';
  if (weaponId === 'weapon-dagger' || weaponId === 'dagger') return 'dagger';
  return 'sword';
}

export function soundTagsFor(loadout: Pick<GarageLoadout, 'chassis' | 'weapon'>): string[] {
  const tags: string[] = [];
  const weapon = weaponCatalogueId(loadout.weapon);
  if (loadout.chassis === 'chassis-basic') tags.push('chassis.light');
  if (weapon === 'weapon-sword') tags.push('weapon.sword');
  if (weapon === 'weapon-axe') tags.push('weapon.axe');
  if (weapon === 'weapon-dagger') tags.push('weapon.dagger');
  return tags;
}

export function withUpdatedPaint(loadout: GarageLoadout, paint: string): GarageLoadout {
  const next = { ...loadout, paint: paintCatalogueId(paint) };
  return { ...next, soundTags: soundTagsFor(next) };
}

export function withUpdatedWeapon(loadout: GarageLoadout, weapon: string): GarageLoadout {
  const next = { ...loadout, weapon: weaponCatalogueId(weapon) };
  return { ...next, soundTags: soundTagsFor(next) };
}
