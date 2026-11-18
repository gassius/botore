/**
 * Ranking portrait framing from Workshop Frame kit-v003.1 `manifest.portrait`.
 *
 * A5: every portrait is a live BotAssembler render of that bot's paint + weapon.
 * Kit sample PNGs are NOT the product portrait source.
 */

/** Display size on ranking rows (ClickUp A5: 46 pt). */
export const PORTRAIT_DISPLAY_PT = 46;

/** Kit rig canvas (1x). Assembler keeps 640; stage overflow is optional. */
export const PORTRAIT_KIT_CANVAS_PX = 640;

/**
 * Kit stage.rig_origin (informational). Portrait crop is authored in rig
 * space; assembly does not translate by this offset.
 */
export const PORTRAIT_STAGE_RIG_ORIGIN = [80, 160] as const;

/**
 * Square crop in kit rig canvas px: [x, y, width, height] (v003.1).
 * Anchored to torso.neck + crop_center_offset [16, -4], crop_size 272.
 */
export const PORTRAIT_CROP_RECT_CANVAS_PX = [190, 41.4, 272, 272] as const;

/** Downsample targets from the kit portrait spec (not Metro require targets). */
export const PORTRAIT_OUTPUT_SIZES_PX = [96, 192, 288] as const;

/**
 * Preferred MotionPose for portrait framing.
 */
export const PORTRAIT_POSE_PREFERRED = 'portrait' as const;

/**
 * Forbidden Metro/require product sources — kit sample sheets must never be
 * the ranking portrait. Checked against BotPortrait.tsx only.
 */
export const PORTRAIT_FORBIDDEN_SAMPLE_REQUIRES = [
  'portraits/oxide-',
  'portraits/petrol-',
  'portraits/scrapgreen-',
  "require('../../assets",
  'require("../../assets',
] as const;

/**
 * Crop window over the 640 rig assembly so head/shoulders fill `displaySize`².
 * Pure layout helper — D4 / tests use this without mounting RN.
 */
export function portraitCropLayout(displaySize: number): {
  readonly canvasSize: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly cropSize: number;
} {
  const [cropX, cropY, cropW] = PORTRAIT_CROP_RECT_CANVAS_PX;
  const scale = displaySize / cropW;
  return {
    canvasSize: PORTRAIT_KIT_CANVAS_PX * scale,
    offsetX: -cropX * scale,
    offsetY: -cropY * scale,
    cropSize: displaySize,
  };
}
