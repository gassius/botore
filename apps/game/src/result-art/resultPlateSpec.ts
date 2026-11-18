/**
 * A3 result plates from Workshop Frame kit-v003 `manifest.plates`.
 * Label-free Garage Tag art; accessibility / native text stay in code.
 */

export type ResultPlateKind = 'victory' | 'defeat' | 'new_record';

export type ResultPlateSpec = {
  readonly kind: ResultPlateKind;
  /** Point size from kit manifest. */
  readonly sizePt: readonly [number, number];
  /** Native / a11y text — plates are images. */
  readonly text: string;
  readonly accessibilityLabel: string;
};

export const RESULT_PLATE_SPECS: Readonly<Record<ResultPlateKind, ResultPlateSpec>> = {
  victory: {
    kind: 'victory',
    sizePt: [300, 96],
    text: 'VICTORY',
    accessibilityLabel: 'Victory',
  },
  defeat: {
    kind: 'defeat',
    sizePt: [300, 96],
    text: 'DEFEAT',
    accessibilityLabel: 'Defeat',
  },
  new_record: {
    kind: 'new_record',
    sizePt: [220, 64],
    text: 'NEW RECORD',
    accessibilityLabel: 'New record',
  },
};

/** Kit note: NEW RECORD stamp tilts over the plate lower-right. Mockup uses ~+12°. */
export const NEW_RECORD_STAMP_ROTATION_DEG = 12;

/** Map device pixel ratio onto kit 1x/2x/3x PNG buckets. */
export function resultPlateDensityBucket(pixelRatio: number): 1 | 2 | 3 {
  if (pixelRatio >= 2.5) return 3;
  if (pixelRatio >= 1.5) return 2;
  return 1;
}
