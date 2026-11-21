/**
 * D11 Confirm Fight face-off metrics (390×844 reference).
 *
 * Kit `size` is the 640×640 canvas width — NOT visible head-to-feet. Idle body
 * spans roughly kitIdleHeadTop→kitGroundY in rig px; scale so that span reads
 * as `bodyHeight` on screen, and plant soles on `groundY` (A6 SCREENS-SPEC).
 *
 * Kit numbers match workshop-frame-v003.3 manifest (`canvas`, `ground_y`) —
 * kept as literals so this module stays free of the assembler / RN graph.
 */
/** Workshop Frame kit-v003.3 rig canvas width. */
const KIT_CANVAS = 640;
/** Workshop Frame kit-v003.3 `ground_y` (sole line in rig px). */
const KIT_GROUND_Y = 495;
/** Idle head sprite top in rig px (assembleBot idle; weapons may extend higher). */
const KIT_IDLE_HEAD_TOP = 38;
/** Target visible head→sole height (pt). */
const BODY_HEIGHT = 260;
const BODY_PX = KIT_GROUND_Y - KIT_IDLE_HEAD_TOP;
/** BotAssembler `size` so BODY_PX × (size/canvas) ≈ BODY_HEIGHT. */
const KIT_SIZE = Math.round((KIT_CANVAS * BODY_HEIGHT) / BODY_PX);

export const CONFIRM_FACE_OFF = {
  /** Full-width band under the status bar (pt). */
  bandHeight: 410,
  /** Visible head-to-feet target (pt). */
  bodyHeight: BODY_HEIGHT,
  /** Minimum accepted visible body height for design review. */
  bodySizeMin: 240,
  /** BotAssembler `size` (kit canvas width in pt). Derived so visible body ≈ bodyHeight. */
  bodySize: KIT_SIZE,
  /** Kit rig canvas width (px) — same as BotAssembler size units. */
  kitCanvas: KIT_CANVAS,
  /** Sole / ground_y in kit rig px. */
  kitGroundY: KIT_GROUND_Y,
  /** Idle head-top in kit rig px used for bodyHeight→kitSize. */
  kitIdleHeadTop: KIT_IDLE_HEAD_TOP,
  /** Body centre x on a 390-wide band (player left, opponent right). */
  leftCenterX: 98,
  rightCenterX: 292,
  /** Shared ground line y within the band (feet + contact shadows). */
  groundY: 332,
  /** VS badge vertical centre within the band. */
  vsCenterY: 176,
  /** Name plate width — fits a 16-character bot name without clipping. */
  plateWidth: 178,
  plateHeight: 52,
} as const;

/** Scale from kit px → band pt for the shared face-off size. */
export function confirmFaceOffScale(): number {
  return CONFIRM_FACE_OFF.bodySize / CONFIRM_FACE_OFF.kitCanvas;
}

/** Kit canvas top (pt within the band) so soles sit on groundY. */
export function confirmFaceOffKitTop(): number {
  return CONFIRM_FACE_OFF.groundY - CONFIRM_FACE_OFF.kitGroundY * confirmFaceOffScale();
}

/** Visible head→sole height at the shared scale (pt). */
export function confirmFaceOffVisibleBodyHeight(): number {
  return (CONFIRM_FACE_OFF.kitGroundY - CONFIRM_FACE_OFF.kitIdleHeadTop) * confirmFaceOffScale();
}
