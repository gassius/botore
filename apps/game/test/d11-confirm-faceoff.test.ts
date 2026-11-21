/**
 * D11 Confirm Fight face-off v2 — layout contract + paint naming + no ToTT title.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePaintVisual } from '../src/assembler/paints';
import { paintDisplayLabel, PROOF_PAINTS } from '../src/garage/loadout/proofCatalogue';
import {
  CONFIRM_FACE_OFF,
  confirmFaceOffKitTop,
  confirmFaceOffScale,
  confirmFaceOffVisibleBodyHeight,
} from '../src/fight/confirmFaceOff';

function readSource(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

describe('D11 Confirm Fight face-off v2', () => {
  it('face-off band and visible body metrics meet acceptance floors', () => {
    expect(CONFIRM_FACE_OFF.bandHeight).toBeGreaterThanOrEqual(410);
    expect(CONFIRM_FACE_OFF.bodyHeight).toBeGreaterThanOrEqual(CONFIRM_FACE_OFF.bodySizeMin);
    expect(CONFIRM_FACE_OFF.bodyHeight).toBeGreaterThanOrEqual(240);
    expect(confirmFaceOffVisibleBodyHeight()).toBeGreaterThanOrEqual(240);
    expect(confirmFaceOffVisibleBodyHeight()).toBeCloseTo(CONFIRM_FACE_OFF.bodyHeight, 0);
    // Kit `size` is canvas width — larger than visible body once padding is cropped by scale.
    expect(CONFIRM_FACE_OFF.bodySize).toBeGreaterThan(CONFIRM_FACE_OFF.bodyHeight);
    expect(CONFIRM_FACE_OFF.plateWidth).toBeGreaterThanOrEqual(168);
  });

  it('plants kit ground_y on the shared ground line (no float above shadows)', () => {
    const scale = confirmFaceOffScale();
    const kitTop = confirmFaceOffKitTop();
    const soleY = kitTop + CONFIRM_FACE_OFF.kitGroundY * scale;
    expect(soleY).toBeCloseTo(CONFIRM_FACE_OFF.groundY, 5);
    const src = readSource('src/fight/screens/ConfirmFightScreen.tsx');
    expect(src).toContain('confirmFaceOffKitTop');
    expect(src).toContain('kitGroundY');
  });

  it('ConfirmFightScreen has no player-visible Tale of the Tape title', () => {
    const src = readSource('src/fight/screens/ConfirmFightScreen.tsx');
    expect(src).not.toMatch(/title=["']Tale of the Tape["']/);
    expect(src).not.toMatch(/>\s*Tale of the Tape\s*</);
    expect(src).not.toMatch(/TALE OF THE TAPE/);
    expect(src).toContain('confirm-back-fab');
    expect(src).toContain('confirm-nameplate-you');
    expect(src).toContain('oxideRim');
    expect(src).toContain('CONFIRM_FACE_OFF.bodySize');
    expect(src).toContain('CONFIRM_FACE_OFF.bandHeight');
    // 0-fights copy lives in the footer, not a mid-screen StatusErrorBanner over the tape.
    expect(src).toContain('confirm-no-allowance');
    expect(src).toMatch(
      /zeroFightsHint[\s\S]*confirm-no-allowance|confirm-no-allowance[\s\S]*zeroFightsHint/,
    );
    expect(src).not.toMatch(/StatusErrorBanner\s*\n\s*title=["']No fights remaining["']/);
  });

  it('paint-navy displays Cobalt; no Navy / Crimson / Cobalt-for-Petrol labels', () => {
    expect(resolvePaintVisual('paint-navy').label).toBe('Cobalt');
    expect(resolvePaintVisual('paint-cobalt').label).toBe('Petrol');
    expect(resolvePaintVisual('paint-crimson').label).toBe('Oxide');
    expect(paintDisplayLabel('paint-navy')).toBe('Cobalt');
    expect(paintDisplayLabel('paint-cobalt')).toBe('Petrol');
    expect(paintDisplayLabel('paint-crimson')).toBe('Oxide');
    const labels = PROOF_PAINTS.map((p) => p.label);
    expect(labels).toContain('Cobalt');
    expect(labels).toContain('Petrol');
    expect(labels).toContain('Oxide');
    expect(labels).not.toContain('Navy');
    expect(labels).not.toContain('Crimson');
    const petrol = PROOF_PAINTS.find((p) => p.partId === 'paint-cobalt');
    expect(petrol?.label).toBe('Petrol');
    const cobalt = PROOF_PAINTS.find((p) => p.partId === 'paint-navy');
    expect(cobalt?.label).toBe('Cobalt');
  });
});
