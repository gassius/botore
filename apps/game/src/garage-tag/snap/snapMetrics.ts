/**
 * Shared snap-list metrics for E6 — SoT A6 TILES-SPEC + D5/D7/D8 mockups.
 * Author A6 carousel tiles to CUSTOMISE_CAROUSEL.tileWidth / snapInterval.
 *
 * Phone reference frame: 390×844.
 */

/** D7 Customise paints + weapons carousel (A6 TILES-SPEC). */
export const CUSTOMISE_CAROUSEL = {
  /** Fixed tile width (pt). */
  tileWidth: 105,
  /** Tile height (pt). */
  tileHeight: 128,
  /** Gap between tiles (pt). */
  gap: 11,
  /**
   * Clipped carousel viewport width (pt): `3×105 + 2×11 = 337`.
   * No content padding inside the clip — otherwise a 4th tile peeks.
   */
  viewportClip: 337,
  /** Snap pitch (= tileWidth + gap). */
  snapInterval: 116,
  /** Whole tiles visible at rest. */
  visibleCount: 3,
  /** Full-tile canvas including check overhang (A6 tile-paint / tile-weapon). */
  tileCanvasWidth: 114,
  tileCanvasHeight: 140,
  /** Check badge overhang above / right of the 105×128 tile. */
  tileOverhang: 9,
} as const;

/** D5 Ludus bot carousel — one full-width card at a time. */
export const LUDUS_BOT_CAROUSEL = {
  cardWidth: 358,
  cardHeight: 462,
  gap: 0,
  sidePadding: 0,
  visibleCount: 1,
} as const;

/** D8 Opponents snapped vertical list (A6 SCREENS-SPEC). */
export const OPPONENTS_LIST = {
  /** Card height including border box (pt). */
  cardHeight: 175,
  /** Gap between cards (pt). */
  gap: 10,
  /** Snap pitch (= cardHeight + gap). */
  snapInterval: 185,
  /** Design list viewport height: `3×175 + 2×10 = 545`. */
  trackHeight: 545,
  /** Whole cards visible at rest. */
  visibleCount: 3,
  /** Left art panel inside the card (pt). */
  artPanelWidth: 170,
  artPanelHeight: 169,
  /** Robot body height inside the panel (pt). */
  robotBodyHeight: 150,
} as const;

export type SnapAxisMetrics = {
  readonly itemSize: number;
  readonly gap: number;
  readonly sidePadding: number;
  readonly visibleCount: number;
};

/** Distance between consecutive snap stops (= item + trailing gap). */
export function snapInterval(itemSize: number, gap: number): number {
  if (itemSize <= 0) throw new Error('snapInterval: itemSize must be > 0');
  if (gap < 0) throw new Error('snapInterval: gap must be >= 0');
  return itemSize + gap;
}

export function customiseCarouselSnapInterval(): number {
  return CUSTOMISE_CAROUSEL.snapInterval;
}

export function ludusBotCarouselSnapInterval(): number {
  return snapInterval(LUDUS_BOT_CAROUSEL.cardWidth, LUDUS_BOT_CAROUSEL.gap);
}

export function opponentsListSnapInterval(): number {
  return OPPONENTS_LIST.snapInterval;
}

/**
 * How many whole items fit in `viewport` given fixed item + gap + side pads.
 * Never returns 0; callers still snap to whole items when only one fits.
 */
export function visibleWholeCount(
  viewport: number,
  itemSize: number,
  gap: number,
  sidePadding = 0,
): number {
  if (viewport <= 0 || itemSize <= 0) return 1;
  const inner = Math.max(0, viewport - sidePadding * 2);
  if (inner < itemSize) return 1;
  return Math.max(1, Math.floor((inner + gap) / (itemSize + gap)));
}

/**
 * Side padding that makes `visibleCount` whole items fill `viewport` exactly.
 * Remainder is split evenly so a rest offset never shows a cut item.
 */
export function sidePaddingForExactFit(
  viewport: number,
  itemSize: number,
  gap: number,
  visibleCount: number,
): number {
  const count = Math.max(1, Math.floor(visibleCount));
  const used = count * itemSize + (count - 1) * gap;
  return Math.max(0, (viewport - used) / 2);
}

/** Max snap index (0-based) so the last page still shows `visibleCount` whole items. */
export function maxSnapIndex(itemCount: number, visibleCount: number): number {
  return Math.max(0, itemCount - Math.max(1, visibleCount));
}

/** Content length along the scroll axis including leading/trailing side padding. */
export function snapContentLength(
  itemCount: number,
  itemSize: number,
  gap: number,
  sidePadding: number,
): number {
  if (itemCount <= 0) return sidePadding * 2;
  return sidePadding * 2 + itemCount * itemSize + Math.max(0, itemCount - 1) * gap;
}

/**
 * Scroll offset for snap index `index` (start-aligned).
 * Clamped so the last stop still shows whole trailing items.
 */
export function offsetForSnapIndex(
  index: number,
  itemCount: number,
  itemSize: number,
  gap: number,
  visibleCount: number,
): number {
  const interval = snapInterval(itemSize, gap);
  const max = maxSnapIndex(itemCount, visibleCount);
  const clamped = Math.min(Math.max(0, Math.floor(index)), max);
  return clamped * interval;
}

/** True when `viewport` shows only whole items for the given metrics (no fractional leftover). */
export function viewportFitsWholeItems(
  viewport: number,
  itemSize: number,
  gap: number,
  sidePadding: number,
  visibleCount: number,
): boolean {
  const expected =
    sidePadding * 2 + visibleCount * itemSize + Math.max(0, visibleCount - 1) * gap;
  return Math.abs(viewport - expected) < 0.5;
}
