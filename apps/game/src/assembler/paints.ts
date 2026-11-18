/**
 * A6 paints v4 — 8 solids + hazard/racing patterns.
 *
 * Catalogue aliases: paint-crimson→oxide, paint-cobalt→petrol (legacy).
 * New catalogue ids: paint-primer, paint-ink, paint-drab, paint-navy (cobalt
 * visual — avoids collision with paint-cobalt=petrol), paint-frost,
 * paint-cinder, paint-hazard, paint-racing.
 *
 * Assembler tints kit paint masks by channel (main/trim/accent). Pattern paints
 * replace the main-channel flat tint with a baked fill (no invented patterns).
 */

import paintsJson from '../../assets/a6-paints-v4/paints.json';
import type { SamplePaintVisual } from './types';

type PaintKind = 'solid' | 'pattern';

type PaintChannel = 'main' | 'trim' | 'accent';

type PaintJsonEntry = {
  readonly id: string;
  readonly name: string;
  readonly kind: PaintKind;
  readonly main: string;
  readonly trim: string;
  readonly accent: string;
  readonly pattern?: {
    readonly parts?: readonly string[];
  };
};

type PaintsJson = {
  readonly channels: {
    readonly main: { readonly parts: readonly string[] };
    readonly trim: { readonly parts: readonly string[] };
    readonly accent: { readonly parts: readonly string[] };
  };
  readonly paints: readonly PaintJsonEntry[];
  readonly paint_tokens: Readonly<Record<string, string>>;
};

const PAINTS_DATA = paintsJson as PaintsJson;

export interface PaintVisualSpec {
  readonly visual: SamplePaintVisual;
  /** Catalogue / atlas part id used with proof pack + save_bot_loadout. */
  readonly cataloguePaintId: string;
  /** Main-channel / token colour — PLACEHOLDER stand-ins / list chips. */
  readonly armourColor: string;
  readonly trimColor: string;
  readonly accentColor: string;
  readonly kind: PaintKind;
  /** Display label for UI swatches (never catalogue ids). */
  readonly label: string;
  /** Pattern fill parts (kit asset ids) when kind === 'pattern'. */
  readonly patternParts: readonly string[];
}

/** Legacy Oxide catalogue alias (paint-crimson). */
export const OXIDE_PAINT: PaintVisualSpec = buildSpec(
  PAINTS_DATA.paints.find((p) => p.id === 'oxide')!,
  'paint-crimson',
);

/** Legacy Petrol catalogue alias (paint-cobalt). */
export const PETROL_PAINT: PaintVisualSpec = buildSpec(
  PAINTS_DATA.paints.find((p) => p.id === 'petrol')!,
  'paint-cobalt',
);

/** D7 / A6 catalogue id for each visual (cobalt visual → paint-navy). */
const CATALOGUE_BY_VISUAL: Readonly<Record<SamplePaintVisual, string>> = {
  oxide: 'paint-crimson',
  petrol: 'paint-cobalt',
  primer: 'paint-primer',
  ink: 'paint-ink',
  drab: 'paint-drab',
  cobalt: 'paint-navy',
  frost: 'paint-frost',
  cinder: 'paint-cinder',
  hazard: 'paint-hazard',
  racing: 'paint-racing',
};

const MAIN_PARTS = new Set(PAINTS_DATA.channels.main.parts);
const TRIM_PARTS = new Set(PAINTS_DATA.channels.trim.parts);
const ACCENT_PARTS = new Set(PAINTS_DATA.channels.accent.parts);

function buildSpec(entry: PaintJsonEntry, cataloguePaintId: string): PaintVisualSpec {
  return {
    visual: entry.id as SamplePaintVisual,
    cataloguePaintId,
    armourColor: entry.main,
    trimColor: entry.trim,
    accentColor: entry.accent,
    kind: entry.kind,
    label: entry.name,
    patternParts: entry.pattern?.parts ?? [],
  };
}

const BY_VISUAL: ReadonlyMap<SamplePaintVisual, PaintVisualSpec> = new Map(
  PAINTS_DATA.paints.map((entry) => {
    const catalogueId = CATALOGUE_BY_VISUAL[entry.id as SamplePaintVisual];
    return [entry.id as SamplePaintVisual, buildSpec(entry, catalogueId)] as const;
  }),
);

const BY_ID: ReadonlyMap<string, PaintVisualSpec> = (() => {
  const map = new Map<string, PaintVisualSpec>();
  for (const spec of BY_VISUAL.values()) {
    map.set(spec.visual, spec);
    map.set(spec.cataloguePaintId, spec);
    map.set(`paint-${spec.visual}`, spec);
  }
  // Legacy aliases already covered by catalogue ids; keep explicit paint-* forms.
  map.set('paint-crimson', OXIDE_PAINT);
  map.set('paint-cobalt', PETROL_PAINT);
  map.set('paint-oxide', OXIDE_PAINT);
  map.set('paint-petrol', PETROL_PAINT);
  return map;
})();

/** Resolve a paint id (catalogue or alias) to A6 v4 visual. Defaults to Oxide. */
export function resolvePaintVisual(paintId: string): PaintVisualSpec {
  return BY_ID.get(paintId) ?? BY_ID.get(paintId.trim().toLowerCase()) ?? OXIDE_PAINT;
}

export function isKnownAssemblerPaintId(paintId: string): boolean {
  const id = paintId.trim().toLowerCase();
  return BY_ID.has(paintId) || BY_ID.has(id);
}

export function listPaintVisuals(): readonly PaintVisualSpec[] {
  return Array.from(BY_VISUAL.values());
}

function channelForPart(partId: string): PaintChannel {
  if (MAIN_PARTS.has(partId) || partId === 'weapon_shield') return 'main';
  if (TRIM_PARTS.has(partId)) return 'trim';
  if (ACCENT_PARTS.has(partId)) return 'accent';
  // A4 weapons v1: melee heads take the accent stain; shield face stays main.
  if (partId.startsWith('weapon_') && partId !== 'weapon_shield') return 'accent';
  return 'main';
}

/** Per-part channel tint for solid (and pattern trim/accent) painting. */
export function channelColorForPart(paintId: string, partId: string): string {
  const paint = resolvePaintVisual(paintId);
  const channel = channelForPart(partId);
  if (channel === 'trim') return paint.trimColor;
  if (channel === 'accent') return paint.accentColor;
  return paint.armourColor;
}

/**
 * Relative Metro path for a baked A6 pattern fill on a main-channel part.
 * Returns null when the paint is solid or the part is outside the pattern set.
 */
export function patternFillRelPath(paintId: string, partId: string): string | null {
  const paint = resolvePaintVisual(paintId);
  if (paint.kind !== 'pattern') return null;
  if (!paint.patternParts.includes(partId)) return null;
  // Main armour + shield face only (A6 v4 pattern rule).
  if (!MAIN_PARTS.has(partId) && partId !== 'weapon_shield') return null;
  return `a6-paints-v4/pattern-fills/${paint.visual}/${partId}.png`;
}

export function isPatternPaint(paintId: string): boolean {
  return resolvePaintVisual(paintId).kind === 'pattern';
}
