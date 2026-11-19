/**
 * E6 shared snap metrics — A6 TILES-SPEC / D5 / D7 / D8.
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
  snapContentLength,
  snapInterval,
  viewportFitsWholeItems,
  visibleWholeCount,
} from '../src/garage-tag/snap/snapMetrics';

describe('E6 snap metrics (A6 TILES-SPEC / D5 / D7 / D8)', () => {
  it('documents Customise 105×128 tiles, snap 116, clip 337', () => {
    expect(CUSTOMISE_CAROUSEL.tileWidth).toBe(105);
    expect(CUSTOMISE_CAROUSEL.tileHeight).toBe(128);
    expect(CUSTOMISE_CAROUSEL.gap).toBe(11);
    expect(customiseCarouselSnapInterval()).toBe(116);
    expect(CUSTOMISE_CAROUSEL.viewportClip).toBe(337);
    expect(CUSTOMISE_CAROUSEL.visibleCount).toBe(3);

    expect(3 * 105 + 2 * 11).toBe(337);
    expect(
      viewportFitsWholeItems(
        CUSTOMISE_CAROUSEL.viewportClip,
        CUSTOMISE_CAROUSEL.tileWidth,
        CUSTOMISE_CAROUSEL.gap,
        0,
        CUSTOMISE_CAROUSEL.visibleCount,
      ),
    ).toBe(true);
    expect(
      visibleWholeCount(
        CUSTOMISE_CAROUSEL.viewportClip,
        CUSTOMISE_CAROUSEL.tileWidth,
        CUSTOMISE_CAROUSEL.gap,
        0,
      ),
    ).toBe(3);
  });

  it('paint/weapon last-stop math matches TILES-SPEC', () => {
    const paintContent = 10 * 105 + 9 * 11;
    expect(paintContent).toBe(1149);
    expect(paintContent - 337).toBe(812);
    expect(812 / 116).toBe(7);

    const weaponContent = 7 * 105 + 6 * 11;
    expect(weaponContent).toBe(801);
    expect(weaponContent - 337).toBe(464);
    expect(464 / 116).toBe(4);
  });

  it('documents Ludus one-card carousel interval', () => {
    expect(LUDUS_BOT_CAROUSEL.cardWidth).toBe(358);
    expect(LUDUS_BOT_CAROUSEL.cardHeight).toBe(400);
    expect(ludusBotCarouselSnapInterval()).toBe(358);
    expect(LUDUS_BOT_CAROUSEL.visibleCount).toBe(1);
  });

  it('documents Opponents 175pt cards + 185pt snap (3 cards)', () => {
    expect(OPPONENTS_LIST.cardHeight).toBe(175);
    expect(OPPONENTS_LIST.gap).toBe(10);
    expect(opponentsListSnapInterval()).toBe(185);
    expect(OPPONENTS_LIST.visibleCount).toBe(3);
    expect(OPPONENTS_LIST.robotBodyHeight).toBe(150);
    expect(3 * 175 + 2 * 10).toBe(OPPONENTS_LIST.trackHeight);
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

    const content = snapContentLength(itemCount, itemSize, gap, 0);
    expect(7 * 116 + 337).toBe(content);
  });

  it('rejects non-positive item sizes', () => {
    expect(() => snapInterval(0, 0)).toThrow(/itemSize/);
    expect(() => snapInterval(10, -1)).toThrow(/gap/);
  });
});
