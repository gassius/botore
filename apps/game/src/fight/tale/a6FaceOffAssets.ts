import type { ImageSourcePropType } from 'react-native';
import { paintUiAlias, weaponUiAlias } from '../../garage/loadout/proofCatalogue';

/**
 * A6 Tale of the Tape face-off layers (ClickUp 1amjtreze87).
 * Transparent 390×400 bots+shadows only — draw over the arena gradient.
 * Prefer live BotAssembler face-off for arbitrary loadouts; these are the
 * authored composites for known combos (and design-capture evidence).
 */
const FACEOFF_PETROL_AXE_VS_WELD_TESS = require('../../../assets/a6-tott/faceoff-petrol-axe-vs-weld-tess.png');
const FACEOFF_HAZARD_HAMMER_VS_FROST_KIT = require('../../../assets/a6-tott/faceoff-hazard-hammer-vs-frost-kit.png');

export type FaceOffLoadoutHint = {
  readonly paintId: string;
  readonly weaponId: string;
};

/** Resolve a pre-baked A6 face-off when both sides match a shipped combo. */
export function resolveA6FaceOffLayer(
  player: FaceOffLoadoutHint,
  opponent: FaceOffLoadoutHint,
): ImageSourcePropType | null {
  const pPaint = paintUiAlias(player.paintId);
  const pWeapon = weaponUiAlias(player.weaponId);
  const oPaint = paintUiAlias(opponent.paintId);
  const pRaw = player.paintId.toLowerCase();
  const oRaw = opponent.paintId.toLowerCase();

  // Pattern demo (E7 paint ids when they land).
  if (pRaw.includes('hazard') && (oRaw.includes('frost') || oPaint === 'oxide')) {
    return FACEOFF_HAZARD_HAMMER_VS_FROST_KIT;
  }

  // Authored D9 preview combo: Petrol axe (player) vs Oxide opponent.
  if (pPaint === 'petrol' && pWeapon === 'axe' && oPaint === 'oxide') {
    return FACEOFF_PETROL_AXE_VS_WELD_TESS;
  }

  return null;
}

/** A6 D9 face-off geometry (pt under status bar). */
export const A6_FACEOFF = {
  width: 390,
  height: 400,
  bodyHeight: 196,
  groundY: 322,
  leftCenterX: 98,
  rightCenterX: 292,
} as const;
