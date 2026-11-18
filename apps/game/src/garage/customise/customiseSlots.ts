/**
 * D3 Customise slot + picker catalogue helpers.
 * Tabs and cards are data-driven from proof catalogue (+ locked placeholders).
 * Adding a 4th owned weapon to PROOF_WEAPONS needs no layout change.
 */
import { garageTag, type WeaponGlyphId } from '../../garage-tag';
import { PROOF_PAINTS, PROOF_WEAPONS } from '../loadout/proofCatalogue';

export type CustomiseSlotId = 'paint' | 'head' | 'body' | 'arms' | 'legs' | 'weapon';

export type CustomiseSlotDef = {
  readonly id: CustomiseSlotId;
  readonly label: string;
  /** True when the parts catalogue has selectable content for this slot. */
  readonly hasContent: boolean;
};

export type PartPickerCardKind = 'paint' | 'weapon' | 'locked';

export type PartPickerCardModel = {
  readonly id: string;
  readonly label: string;
  readonly kind: PartPickerCardKind;
  readonly selected: boolean;
  readonly locked: boolean;
  /** Paint preview colour — only for paint cards. */
  readonly paintColor?: string;
  /** Weapon glyph — only for owned weapon cards. */
  readonly weaponGlyph?: WeaponGlyphId;
};

/** Fixed slot order from the D3 mockup. Empty slots stay dashed until A4. */
export const CUSTOMISE_SLOTS: readonly CustomiseSlotDef[] = [
  { id: 'paint', label: 'Paint', hasContent: PROOF_PAINTS.length > 0 },
  { id: 'head', label: 'Head', hasContent: false },
  { id: 'body', label: 'Body', hasContent: false },
  { id: 'arms', label: 'Arms', hasContent: false },
  { id: 'legs', label: 'Legs', hasContent: false },
  { id: 'weapon', label: 'Weapon', hasContent: PROOF_WEAPONS.length > 0 },
] as const;

/** Future weapons shown as locked "Coming soon" cards (mockup placeholders). */
export const COMING_SOON_WEAPONS = [
  { id: 'weapon-mace-soon', label: 'Mace' },
  { id: 'weapon-spear-soon', label: 'Spear' },
] as const;

const PAINT_COLORS: Record<string, string> = {
  oxide: garageTag.oxide,
  petrol: garageTag.petrol,
};

export function paintColorForAlias(alias: string): string {
  return PAINT_COLORS[alias] ?? garageTag.steel;
}

export function buildPaintPickerCards(selectedPaintAlias: string): PartPickerCardModel[] {
  return PROOF_PAINTS.map((paint) => ({
    id: paint.partId,
    label: paint.label,
    kind: 'paint' as const,
    selected: selectedPaintAlias === paint.uiAlias,
    locked: false,
    paintColor: paintColorForAlias(paint.uiAlias),
  }));
}

export function buildWeaponPickerCards(selectedWeaponAlias: string): PartPickerCardModel[] {
  const owned: PartPickerCardModel[] = PROOF_WEAPONS.map((weapon) => ({
    id: weapon.partId,
    label: weapon.label,
    kind: 'weapon' as const,
    selected: selectedWeaponAlias === weapon.uiAlias,
    locked: false,
    weaponGlyph: weapon.uiAlias,
  }));
  const locked: PartPickerCardModel[] = COMING_SOON_WEAPONS.map((weapon) => ({
    id: weapon.id,
    label: weapon.label,
    kind: 'locked' as const,
    selected: false,
    locked: true,
  }));
  return [...owned, ...locked];
}

export function pickerMetaLabel(_slot: CustomiseSlotId, ownedCount: number): string {
  if (ownedCount <= 0) return 'Nothing owned yet';
  if (ownedCount === 1) return '1 owned';
  return `${ownedCount} owned · swipe for more →`;
}

/** Stage height target from D3 mockup (pt) — prefer as max; flex down for insets. */
export const CUSTOMISE_STAGE_HEIGHT = 410;

/** Floor so the robot stage stays visibly larger than pre-D3 on short phones. */
export const CUSTOMISE_STAGE_MIN_HEIGHT = 300;

/** Horizontal picker card size — E6 / D7 snap carousel (pt). */
export const PART_PICKER_CARD = { width: 105, height: 128 } as const;

/** Bot display width inside the ~410pt stage (scales with flex stage). */
export const CUSTOMISE_BOT_SIZE = 360;

/** Brief "Equipped" confirmation after a successful save (ms). */
export const EQUIPPED_CONFIRM_MS = 1200;
