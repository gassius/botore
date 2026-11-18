/**
 * Brand + glyph asset map.
 *
 * Brand swap lives here (one file): launch-v001 wordmark / icon / splash /
 * in-app title. ui-kit-v0.1 keeps panels/buttons/tabs/glyphs + robot-head
 * ranking marks only — its wordmark/icon/static-launch are retired.
 *
 * E7: weapon glyphs prefer customise-tiles/weapon/*.png; sword/axe/dagger
 * fall back to ui-kit glyphs when customise-tiles missing.
 */
import wordmarkDark from '../../assets/launch-v001/wordmark/wordmark-dark-2400w.png';
import wordmarkLight from '../../assets/launch-v001/wordmark/wordmark-light-2400w.png';
import wordmarkSmall from '../../assets/launch-v001/wordmark/wordmark-small-dark-2400w.png';
import wordmarkSmallLight from '../../assets/launch-v001/wordmark/wordmark-small-light-2400w.png';
import appIcon from '../../assets/launch-v001/icon/icon-ios-1024.png';
import titleSilhouette from '../../assets/launch-v001/title/title-composite-silhouette-1290x2796.png';
import robotHead from '../../assets/ui-kit-v0.1/brand/robot-head.png';
import robotHeadSmall from '../../assets/ui-kit-v0.1/brand/robot-head-small.png';
import robotHeadMono from '../../assets/ui-kit-v0.1/brand/robot-head-mono.png';
import glyphCheck from '../../assets/ui-kit-v0.1/glyphs/glyph-check.png';
import glyphCheckLight from '../../assets/ui-kit-v0.1/glyphs/glyph-check-light.png';
import glyphCheckSelected from '../../assets/ui-kit-v0.1/glyphs/glyph-check-selected.png';
import glyphBack from '../../assets/ui-kit-v0.1/glyphs/glyph-back.png';
import glyphPlay from '../../assets/ui-kit-v0.1/glyphs/glyph-play.png';
import glyphPause from '../../assets/ui-kit-v0.1/glyphs/glyph-pause.png';
import glyphReplay from '../../assets/ui-kit-v0.1/glyphs/glyph-replay.png';
import glyphSound from '../../assets/ui-kit-v0.1/glyphs/glyph-sound.png';
import glyphMute from '../../assets/ui-kit-v0.1/glyphs/glyph-mute.png';
import glyphClose from '../../assets/ui-kit-v0.1/glyphs/glyph-close.png';
import glyphSword from '../../assets/ui-kit-v0.1/glyphs/glyph-sword.png';
import glyphAxe from '../../assets/ui-kit-v0.1/glyphs/glyph-axe.png';
import glyphDagger from '../../assets/ui-kit-v0.1/glyphs/glyph-dagger.png';
import tileSword from '../../assets/customise-tiles/weapon/sword.png';
import tileAxe from '../../assets/customise-tiles/weapon/axe.png';
import tileDagger from '../../assets/customise-tiles/weapon/dagger.png';
import tileMace from '../../assets/customise-tiles/weapon/mace.png';
import tileHammer from '../../assets/customise-tiles/weapon/hammer.png';
import tileSpear from '../../assets/customise-tiles/weapon/spear.png';
import tileShield from '../../assets/customise-tiles/weapon/shield.png';
import swatchOxide from '../../assets/customise-tiles/swatch/oxide.png';
import swatchPetrol from '../../assets/customise-tiles/swatch/petrol.png';
import swatchPrimer from '../../assets/customise-tiles/swatch/primer.png';
import swatchInk from '../../assets/customise-tiles/swatch/ink.png';
import swatchDrab from '../../assets/customise-tiles/swatch/drab.png';
import swatchCobalt from '../../assets/customise-tiles/swatch/cobalt.png';
import swatchFrost from '../../assets/customise-tiles/swatch/frost.png';
import swatchCinder from '../../assets/customise-tiles/swatch/cinder.png';
import swatchHazard from '../../assets/customise-tiles/swatch/hazard.png';
import swatchRacing from '../../assets/customise-tiles/swatch/racing.png';

/** launch-v001 wordmark intrinsic aspect (2400×558). */
export const BRAND_WORDMARK_ASPECT = { width: 2400, height: 558 } as const;

/** In-app title silhouette composite intrinsic size (1290×2796). */
export const TITLE_SILHOUETTE_ASPECT = { width: 1290, height: 2796 } as const;

export const uiKitAssets = {
  wordmarkDark,
  wordmarkLight,
  wordmarkSmall,
  wordmarkSmallLight,
  robotHead,
  robotHeadSmall,
  robotHeadMono,
  appIcon,
  /** REF-01 in-app title — silhouette composite (not layered title/*, not lit). */
  titleSilhouette,
  glyphCheck,
  glyphCheckLight,
  glyphCheckSelected,
  glyphBack,
  glyphPlay,
  glyphPause,
  glyphReplay,
  glyphSound,
  glyphMute,
  glyphClose,
  glyphSword,
  glyphAxe,
  glyphDagger,
} as const;

export type WeaponGlyphId = 'sword' | 'axe' | 'dagger' | 'mace' | 'hammer' | 'spear' | 'shield';

const WEAPON_TILE_GLYPHS: Record<WeaponGlyphId, typeof tileSword> = {
  sword: tileSword,
  axe: tileAxe,
  dagger: tileDagger,
  mace: tileMace,
  hammer: tileHammer,
  spear: tileSpear,
  shield: tileShield,
};

export function weaponGlyphSource(id: WeaponGlyphId) {
  if (WEAPON_TILE_GLYPHS[id]) return WEAPON_TILE_GLYPHS[id];
  switch (id) {
    case 'axe':
      return uiKitAssets.glyphAxe;
    case 'dagger':
      return uiKitAssets.glyphDagger;
    case 'sword':
    default:
      return uiKitAssets.glyphSword;
  }
}

export type PaintSwatchId =
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

const PAINT_SWATCHES: Record<PaintSwatchId, typeof swatchOxide> = {
  oxide: swatchOxide,
  petrol: swatchPetrol,
  primer: swatchPrimer,
  ink: swatchInk,
  drab: swatchDrab,
  cobalt: swatchCobalt,
  frost: swatchFrost,
  cinder: swatchCinder,
  hazard: swatchHazard,
  racing: swatchRacing,
};

/** Prefer customise-tiles/swatch PNGs (E7); falls back to null for unknown ids. */
export function paintSwatchSource(id: string) {
  return PAINT_SWATCHES[id as PaintSwatchId] ?? null;
}
