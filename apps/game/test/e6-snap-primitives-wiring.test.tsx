/**
 * E6: Customise + Opponents adopt shared snap primitives (no one-off snap math).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('E6 shared snap primitive wiring', () => {
  it('PartPickerStrip uses SnapCarousel + CUSTOMISE_CAROUSEL metrics', () => {
    const src = read('src/garage-tag/PartPickerStrip.tsx');
    expect(src).toContain('SnapCarousel');
    expect(src).toContain('CUSTOMISE_CAROUSEL');
    expect(src).not.toMatch(/ScrollView/);
  });

  it('OpponentsScreen uses SnapVerticalList + OPPONENTS_LIST metrics', () => {
    const src = read('src/fight/screens/OpponentsScreen.tsx');
    expect(src).toContain('SnapVerticalList');
    expect(src).toContain('OPPONENTS_LIST');
    expect(src).toContain('opponents-snap-list');
    expect(src).not.toMatch(/<ScrollView/);
  });

  it('snap metrics module is the single documented A6 grid', () => {
    const src = read('src/garage-tag/snap/snapMetrics.ts');
    expect(src).toContain('tileWidth: 105');
    expect(src).toContain('gap: 11');
    expect(src).toContain('cardHeight: 175');
    expect(src).toContain('cardWidth: 358');
  });
});
