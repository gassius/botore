/**
 * Shared snap-list metrics for E6 (SoT: D5 Ludus, D7 Customise, D8 Opponents).
 * A6 carousel tiles must match CUSTOMISE_CAROUSEL.tileWidth / snapInterval.
 *
 * Phone reference frame: 390×844. Track / list widths below are the content
 * gutters inside ScreenChrome on that frame — not the full device width.
 */

/** D7 Customise paints + weapons carousel (and future pattern tiles). */
export const CUSTOMISE_CAROUSEL = {
  /** Fixed tile width (pt). Exactly 3 tiles + gaps fit the 358pt track. */
  tileWidth: 105,
  /** Tile height from D3/D7 card art (pt). */
  tileHeight: 134,
  /** Gap between tiles (pt). */
  gap: 11,
  /**
   * Horizontal inset on the strip (pt). Exact-fit for 3×105 + 2×11 in 358:
   * `(358 - 315 - 22) / 2 = 10.5`. D7's "16 px" is panel chrome, not strip inset.
   */
  sidePadding: 10.5,
  /** Design track width on 390×844 (pt). */
  trackWidth: 358,
  /** Whole tiles visible at rest on the design track. */
  visibleCount: 3,
} as const;

/** D5 Ludus bot carousel — one full-width card at a time. */
export const LUDUS_BOT_CAROUSEL = {
  cardWidth: 358,
  cardHeight: 462,
  gap: 0,
  sidePadding: 0,
  visibleCount: 1,
} as const;

/** D8 Opponents snapped vertical list. */
export const OPPONENTS_LIST = {
  /** Card height including its own border box (pt). */
  cardHeight: 175,
  /** Gap between cards (pt). Zero so 3×175 fits the list viewport cleanly. */
  gap: 0,
  /** Whole cards visible at rest on 390×844 between quota panel and Continue. */
  visibleCount: 3,
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
  return snapInterval(CUSTOMISE_CAROUSEL.tileWidth, CUSTOMISE_CAROUSEL.gap);
}

export function ludusBotCarouselSnapInterval(): number {
  return snapInterval(LUDUS_BOT_CAROUSEL.cardWidth, LUDUS_BOT_CAROUSEL.gap);
}

export function opponentsListSnapInterval(): number {
  return snapInterval(OPPONENTS_LIST.cardHeight, OPPONENTS_LIST.gap);
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
