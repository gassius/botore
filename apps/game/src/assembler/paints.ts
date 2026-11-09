/**
 * Oxide + Petrol paint mapping (F7).
 *
 * Catalogue ids remain `paint-crimson` / `paint-cobalt` (no catalogue expansion).
 * Visual tokens follow kit-v002 proposed colours when the kit is present.
 */

import type { SamplePaintVisual } from './types';

export interface PaintVisualSpec {
  readonly visual: SamplePaintVisual;
  /** Catalogue / atlas part id used with F5 proof pack. */
  readonly cataloguePaintId: string;
  /** Armour fill — PLACEHOLDER stand-ins / kit paint_tokens. */
  readonly armourColor: string;
  /** Display label for UI swatches (non-colour selected states are shell/F8). */
  readonly label: string;
}

/** Kit-v002 proposed Oxide — not an approved brand/UI token. */
export const OXIDE_PAINT: PaintVisualSpec = {
  visual: 'oxide',
  cataloguePaintId: 'paint-crimson',
  armourColor: '#e8771c',
  label: 'Oxide',
};

/** Kit-v002 proposed Petrol — not an approved brand/UI token. */
export const PETROL_PAINT: PaintVisualSpec = {
  visual: 'petrol',
  cataloguePaintId: 'paint-cobalt',
  armourColor: '#27877b',
  label: 'Petrol',
};

const BY_ID: ReadonlyMap<string, PaintVisualSpec> = new Map([
  ['oxide', OXIDE_PAINT],
  ['petrol', PETROL_PAINT],
  [OXIDE_PAINT.cataloguePaintId, OXIDE_PAINT],
  [PETROL_PAINT.cataloguePaintId, PETROL_PAINT],
  ['paint-oxide', OXIDE_PAINT],
  ['paint-petrol', PETROL_PAINT],
]);

/** Resolve a paint id (catalogue or alias) to Oxide / Petrol. Defaults to Oxide. */
export function resolvePaintVisual(paintId: string): PaintVisualSpec {
  return BY_ID.get(paintId) ?? OXIDE_PAINT;
}

export function isKnownAssemblerPaintId(paintId: string): boolean {
  return BY_ID.has(paintId);
}
