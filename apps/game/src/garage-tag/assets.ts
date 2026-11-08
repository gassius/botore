/**
 * ui-kit-v0.1 asset map. Prefer parametric chrome; use PNGs for brand/glyphs only.
 * Stretch rules: brand/glyphs = uniform aspect; never stretch-to-fill.
 */
import wordmarkDark from '../../assets/ui-kit-v0.1/brand/wordmark-dark.png';
import wordmarkLight from '../../assets/ui-kit-v0.1/brand/wordmark-light.png';
import wordmarkSmall from '../../assets/ui-kit-v0.1/brand/wordmark-small.png';
import robotHead from '../../assets/ui-kit-v0.1/brand/robot-head.png';
import robotHeadSmall from '../../assets/ui-kit-v0.1/brand/robot-head-small.png';
import robotHeadMono from '../../assets/ui-kit-v0.1/brand/robot-head-mono.png';
import appIcon from '../../assets/ui-kit-v0.1/brand/app-icon.png';
import launchStatic from '../../assets/ui-kit-v0.1/brand/launch-static.png';
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

export const uiKitAssets = {
  wordmarkDark,
  wordmarkLight,
  wordmarkSmall,
  robotHead,
  robotHeadSmall,
  robotHeadMono,
  appIcon,
  launchStatic,
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

export type WeaponGlyphId = 'sword' | 'axe' | 'dagger';

export function weaponGlyphSource(id: WeaponGlyphId) {
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
