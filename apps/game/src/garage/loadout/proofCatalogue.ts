import type { GarageLoadout } from './loadoutTypes';
import type { WeaponGlyphId } from '../../garage-tag';
import { resolvePaintVisual } from '../../assembler/paints';
import { SHAPE_OPTIONS, STOCK_SHAPES, shapePartId, type ShapeSlot } from '../../assembler/shapes';
import { WORKSHOP_FRAME_ATLAS_VERSION } from '../../atlas/workshop-frame-paths';

/**
 * Proof catalogue ids for customise / first-run.
 * Legacy: paint-crimson→Oxide, paint-cobalt→Petrol.
 * A6 v4: 8 solids + hazard/racing; cobalt visual uses paint-navy.
 */

/** Seeded proof character — DEV adapter fixture only; live path resolves ownership. */
export const PROOF_CHARACTER_ID = 'player-hero';
export const PROOF_DISPLAY_NAME = 'Hero';
/** First-run / DEV pin — single Development atlas `v1` (proof + workshop-frame-v003). */
export const PROOF_ATLAS_VERSION = WORKSHOP_FRAME_ATLAS_VERSION;

/** D7 order: oxide → petrol → primer → ink → drab → cobalt → frost → cinder → hazard → racing. */
export const PROOF_PAINTS = [
  { partId: 'paint-crimson', label: 'Oxide', uiAlias: 'oxide' as const },
  { partId: 'paint-cobalt', label: 'Petrol', uiAlias: 'petrol' as const },
  { partId: 'paint-primer', label: 'Primer', uiAlias: 'primer' as const },
  { partId: 'paint-ink', label: 'Ink', uiAlias: 'ink' as const },
  { partId: 'paint-drab', label: 'Drab', uiAlias: 'drab' as const },
  { partId: 'paint-navy', label: 'Navy', uiAlias: 'cobalt' as const },
  { partId: 'paint-frost', label: 'Frost', uiAlias: 'frost' as const },
  { partId: 'paint-cinder', label: 'Cinder', uiAlias: 'cinder' as const },
  { partId: 'paint-hazard', label: 'Hazard', uiAlias: 'hazard' as const },
  { partId: 'paint-racing', label: 'Racing', uiAlias: 'racing' as const },
] as const;

/** All 7 weapons unlocked (no Coming soon). */
export const PROOF_WEAPONS = [
  { partId: 'weapon-sword', label: 'Sword', uiAlias: 'sword' as const },
  { partId: 'weapon-axe', label: 'Axe', uiAlias: 'axe' as const },
  { partId: 'weapon-dagger', label: 'Dagger', uiAlias: 'dagger' as const },
  { partId: 'weapon-mace', label: 'Mace', uiAlias: 'mace' as const },
  { partId: 'weapon-hammer', label: 'Hammer', uiAlias: 'hammer' as const },
  { partId: 'weapon-spear', label: 'Spear', uiAlias: 'spear' as const },
  { partId: 'weapon-shield', label: 'Shield', uiAlias: 'shield' as const },
] as const;

/** A4 shapes v2.1 per slot, stock first (cosmetic; no sound tags). */
export const PROOF_SHAPES = SHAPE_OPTIONS;

/** Stock A4 shape catalogue ids — what a pre-A4 loadout reads as. */
export const STOCK_SHAPE_LOADOUT: Pick<GarageLoadout, ShapeSlot> = {
  head: shapePartId('head', STOCK_SHAPES.head),
  body: shapePartId('body', STOCK_SHAPES.body),
  arms: shapePartId('arms', STOCK_SHAPES.arms),
  legs: shapePartId('legs', STOCK_SHAPES.legs),
};

export const DEFAULT_CONFIRMED_LOADOUT: GarageLoadout = {
  chassis: 'chassis-basic',
  paint: 'paint-crimson',
  weapon: 'weapon-sword',
  shield: null,
  drone: null,
  decals: [],
  soundTags: ['chassis.light', 'weapon.sword'],
  ...STOCK_SHAPE_LOADOUT,
};

const PAINT_ALIAS_TO_CATALOGUE: Readonly<Record<string, string>> = Object.fromEntries(
  PROOF_PAINTS.map((p) => [p.uiAlias, p.partId]),
);

export function paintCatalogueId(aliasOrId: string): string {
  const trimmed = aliasOrId.trim();
  if (PAINT_ALIAS_TO_CATALOGUE[trimmed]) return PAINT_ALIAS_TO_CATALOGUE[trimmed]!;
  // Legacy paint-oxide / paint-petrol → catalogue aliases.
  if (trimmed === 'paint-oxide') return 'paint-crimson';
  if (trimmed === 'paint-petrol') return 'paint-cobalt';
  return resolvePaintVisual(trimmed).cataloguePaintId;
}

export function paintUiAlias(paintId: string): string {
  const visual = resolvePaintVisual(paintId).visual;
  return visual;
}

/** Player-facing paint label — never catalogue ids. */
export function paintDisplayLabel(paintId: string): string {
  return resolvePaintVisual(paintId).label;
}

const WEAPON_ALIAS_TO_CATALOGUE: Readonly<Record<string, string>> = Object.fromEntries(
  PROOF_WEAPONS.map((w) => [w.uiAlias, w.partId]),
);

export function weaponCatalogueId(aliasOrId: string): string {
  const trimmed = aliasOrId.trim();
  if (WEAPON_ALIAS_TO_CATALOGUE[trimmed]) return WEAPON_ALIAS_TO_CATALOGUE[trimmed]!;
  if (trimmed.startsWith('weapon-')) return trimmed;
  if (trimmed.startsWith('weapon_')) return trimmed.replace(/_/g, '-');
  return trimmed;
}

export function weaponUiAlias(weaponId: string): WeaponGlyphId {
  const id = weaponId.trim().toLowerCase().replace(/_/g, '-');
  for (const w of PROOF_WEAPONS) {
    if (id === w.partId || id === w.uiAlias || id === `weapon-${w.uiAlias}`) {
      return w.uiAlias;
    }
  }
  return 'sword';
}

/** Player-facing weapon label — never catalogue ids. */
export function weaponDisplayLabel(weaponId: string): string {
  const alias = weaponUiAlias(weaponId);
  const row = PROOF_WEAPONS.find((w) => w.uiAlias === alias);
  return row?.label ?? 'Sword';
}

export function soundTagsFor(loadout: Pick<GarageLoadout, 'chassis' | 'weapon'>): string[] {
  const tags: string[] = [];
  const weapon = weaponCatalogueId(loadout.weapon);
  if (loadout.chassis === 'chassis-basic') tags.push('chassis.light');
  const kind = weaponUiAlias(weapon);
  tags.push(`weapon.${kind}`);
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

/** Shapes carry no sound tags, so soundTags stay as they are. */
export function withUpdatedShape(
  loadout: GarageLoadout,
  slot: ShapeSlot,
  aliasOrId: string,
): GarageLoadout {
  return { ...loadout, [slot]: shapePartId(slot, aliasOrId) };
}
