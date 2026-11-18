/**
 * E6 shared snap metrics — D5 / D7 / D8 SoT for A6 tile authorship.
 */
import { describe, expect, it } from 'vitest';
import {
  CUSTOMISE_CAROUSEL,
  LUDUS_BOT_CAROUSEL,
  OPPONENTS_LIST,
  customiseCarouselSnapInterval,
  ludusBotCarouselSnapInterval,
  maxSnapIndex,
  offsetForSnapIndex,
  opponentsListSnapInterval,
  sidePaddingForExactFit,
  snapContentLength,
  snapInterval,
  viewportFitsWholeItems,
  visibleWholeCount,
} from '../src/garage-tag/snap/snapMetrics';

describe('E6 snap metrics (D5 / D7 / D8)', () => {
  it('documents Customise carousel tile + snap interval for A6', () => {
    expect(CUSTOMISE_CAROUSEL.tileWidth).toBe(105);
    expect(CUSTOMISE_CAROUSEL.tileHeight).toBe(134);
    expect(CUSTOMISE_CAROUSEL.gap).toBe(11);
    expect(customiseCarouselSnapInterval()).toBe(116);

    const used =
      CUSTOMISE_CAROUSEL.visibleCount * CUSTOMISE_CAROUSEL.tileWidth +
      (CUSTOMISE_CAROUSEL.visibleCount - 1) * CUSTOMISE_CAROUSEL.gap +
      CUSTOMISE_CAROUSEL.sidePadding * 2;
    expect(used).toBe(CUSTOMISE_CAROUSEL.trackWidth);
    expect(
      viewportFitsWholeItems(
        CUSTOMISE_CAROUSEL.trackWidth,
        CUSTOMISE_CAROUSEL.tileWidth,
        CUSTOMISE_CAROUSEL.gap,
        CUSTOMISE_CAROUSEL.sidePadding,
        CUSTOMISE_CAROUSEL.visibleCount,
      ),
    ).toBe(true);
  });

  it('documents Ludus one-card carousel interval', () => {
    expect(LUDUS_BOT_CAROUSEL.cardWidth).toBe(358);
    expect(LUDUS_BOT_CAROUSEL.cardHeight).toBe(462);
    expect(ludusBotCarouselSnapInterval()).toBe(358);
    expect(LUDUS_BOT_CAROUSEL.visibleCount).toBe(1);
  });

  it('documents Opponents 175pt snap interval (3 cards)', () => {
    expect(OPPONENTS_LIST.cardHeight).toBe(175);
    expect(OPPONENTS_LIST.gap).toBe(0);
    expect(opponentsListSnapInterval()).toBe(175);
    expect(OPPONENTS_LIST.visibleCount).toBe(3);
    expect(3 * OPPONENTS_LIST.cardHeight).toBe(525);
  });

  it('never leaves a fractional tile in the design track', () => {
    const count = visibleWholeCount(
      CUSTOMISE_CAROUSEL.trackWidth,
      CUSTOMISE_CAROUSEL.tileWidth,
      CUSTOMISE_CAROUSEL.gap,
      CUSTOMISE_CAROUSEL.sidePadding,
    );
    expect(count).toBe(3);

    const pad = sidePaddingForExactFit(358, 105, 11, 3);
    expect(pad).toBe(10.5);
  });

  it('clamps first / middle / last snap offsets to whole-item stops', () => {
    const itemCount = 10;
    const visible = 3;
    const itemSize = 105;
    const gap = 11;

    expect(offsetForSnapIndex(0, itemCount, itemSize, gap, visible)).toBe(0);
    expect(offsetForSnapIndex(4, itemCount, itemSize, gap, visible)).toBe(4 * 116);
    expect(maxSnapIndex(itemCount, visible)).toBe(7);
    expect(offsetForSnapIndex(99, itemCount, itemSize, gap, visible)).toBe(7 * 116);

    const content = snapContentLength(itemCount, itemSize, gap, 10.5);
    // Last page: offset + track = content end.
    expect(7 * 116 + 358).toBe(content);
  });

  it('rejects non-positive item sizes', () => {
    expect(() => snapInterval(0, 0)).toThrow(/itemSize/);
    expect(() => snapInterval(10, -1)).toThrow(/gap/);
  });
});
