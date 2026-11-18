/**
 * D3/D7 Customise slot + picker catalogue helpers.
 * Tabs and cards are data-driven from proof catalogue (10 paints / 7 weapons).
 */
import { resolvePaintVisual } from '../../assembler/paints';
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
  /** True for hazard/racing pattern liveries (PATTERN tag). */
  readonly patternTag?: boolean;
  /** Paint visual alias for A6 tile lookup. */
  readonly paintAlias?: string;
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

export function paintColorForAlias(alias: string): string {
  return resolvePaintVisual(alias).armourColor || garageTag.steel;
}

export function buildPaintPickerCards(selectedPaintAlias: string): PartPickerCardModel[] {
  return PROOF_PAINTS.map((paint) => {
    const visual = resolvePaintVisual(paint.uiAlias);
    return {
      id: paint.partId,
      label: paint.label,
      kind: 'paint' as const,
      selected: selectedPaintAlias === paint.uiAlias,
      locked: false,
      paintColor: paintColorForAlias(paint.uiAlias),
      paintAlias: paint.uiAlias,
      ...(visual.kind === 'pattern' ? { patternTag: true } : {}),
    };
  });
}

export function buildWeaponPickerCards(selectedWeaponAlias: string): PartPickerCardModel[] {
  return PROOF_WEAPONS.map((weapon) => ({
    id: weapon.partId,
    label: weapon.label,
    kind: 'weapon' as const,
    selected: selectedWeaponAlias === weapon.uiAlias,
    locked: false,
    weaponGlyph: weapon.uiAlias,
  }));
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
