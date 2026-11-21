/**
 * D11 Confirm Fight face-off metrics (390×844 reference).
 * Scaled up from A6 SCREENS-SPEC (band 400 / body 196) per ticket 1amjtrezw21.
 */
export const CONFIRM_FACE_OFF = {
  /** Full-width band under the status bar (pt). */
  bandHeight: 410,
  /** Shared kit `size` ≈ body height; both bots use the same scale. */
  bodySize: 260,
  /** Minimum accepted body height for design review. */
  bodySizeMin: 240,
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
