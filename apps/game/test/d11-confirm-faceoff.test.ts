/**
 * D11 Confirm Fight face-off v2 — layout contract + paint naming + no ToTT title.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePaintVisual } from '../src/assembler/paints';
import { paintDisplayLabel, PROOF_PAINTS } from '../src/garage/loadout/proofCatalogue';
import { CONFIRM_FACE_OFF } from '../src/fight/confirmFaceOff';

function readSource(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

describe('D11 Confirm Fight face-off v2', () => {
  it('face-off band and body metrics meet acceptance floors', () => {
    expect(CONFIRM_FACE_OFF.bandHeight).toBeGreaterThanOrEqual(410);
    expect(CONFIRM_FACE_OFF.bodySize).toBeGreaterThanOrEqual(CONFIRM_FACE_OFF.bodySizeMin);
    expect(CONFIRM_FACE_OFF.bodySize).toBeGreaterThanOrEqual(240);
    expect(CONFIRM_FACE_OFF.plateWidth).toBeGreaterThanOrEqual(168);
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
