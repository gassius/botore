/**
 * PRR #77: smear tiles must scale with the bot and mirror the full box
 * for the far fighter (not pivot-only left + oversize intrinsic Image).
 */
import { describe, expect, it } from 'vitest';
import { kitSmearAnchorLeft, smearOverlayLayout } from '../src/assembler/kitMath';

describe('smear overlay layout (both facings)', () => {
  it('scales size_1x and mirrors the full tile box for facing-left', () => {
    // PRR example: axe attack f26 — 581×276 at x=90, display size 448 (scale 0.7).
    const size = 448;
    const scale = size / 640;
    const offsetRigPx = [90, -7] as const;
    const size1x = [581, 276] as const;

    const right = smearOverlayLayout({
      offsetRigPx,
      size1x,
      scale,
      canvasSize: size,
      mirrored: false,
    });
    expect(right.left).toBeCloseTo(90 * scale, 5);
    expect(right.width).toBeCloseTo(581 * scale, 5);
    expect(right.height).toBeCloseTo(276 * scale, 5);
    expect(right.top).toBeCloseTo(-7 * scale, 5);

    const left = smearOverlayLayout({
      offsetRigPx,
      size1x,
      scale,
      canvasSize: size,
      mirrored: true,
    });
    // Mirrored box: [size − (x+w)·scale, size − x·scale] ≈ [-22, 385]
    expect(left.left).toBeCloseTo(size - (90 + 581) * scale, 5);
    expect(left.left + left.width).toBeCloseTo(size - 90 * scale, 5);
    expect(left.width).toBeCloseTo(right.width, 5);
    expect(kitSmearAnchorLeft(90, 581, scale, size, true)).toBeCloseTo(left.left, 5);
  });

  it('keeps dagger smear short relative to an unscaled intrinsic tile', () => {
    const size = 280;
    const scale = size / 640;
    const box = smearOverlayLayout({
      offsetRigPx: [345, 223],
      size1x: [348, 69],
      scale,
      canvasSize: size,
      mirrored: false,
    });
    expect(box.width).toBeLessThan(348); // must not paint at intrinsic dp
    expect(box.width).toBeCloseTo(348 * scale, 5);
  });
});
