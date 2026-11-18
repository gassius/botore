import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACK_TO_STABLE_LABEL, STABLE_HOME_TITLE } from '../src/garage/stableHomeCopy';

const ROOT = process.cwd();

function readSource(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('E5 Ludus home nav + Sign out under More', () => {
  it('single-sources home title as Ludus (D5) for title and Back-to label', () => {
    expect(STABLE_HOME_TITLE).toBe('Ludus');
    expect(BACK_TO_STABLE_LABEL).toBe('Back to Ludus');

    const copy = readSource('src/garage/stableHomeCopy.ts');
    expect(copy).toContain("'Ludus'");
    expect(copy).not.toMatch(/STABLE_HOME_TITLE\s*=\s*'Stable'/);

    const stable = readSource('src/garage/screens/StableScreen.tsx');
    expect(stable).toContain('STABLE_HOME_TITLE');
    expect(stable).not.toMatch(/title=["']Stable["']/);

    const band = readSource('src/result-overlay/ResultOverlayBand.tsx');
    expect(band).toContain('BACK_TO_STABLE_LABEL');
    expect(band).not.toContain('"Back to Stable"');
    expect(band).not.toContain("'Back to Stable'");
  });

  it('main footer: Settings above More last; Sign out only under More; Create Bot slot reserved', () => {
    const stable = readSource('src/garage/screens/StableScreen.tsx');

    expect(stable).toContain('testID="stable-settings"');
    expect(stable).toContain('testID="stable-more"');
    expect(stable).toContain('testID="stable-sign-out"');
    expect(stable).toContain('testID="stable-privacy-policy"');
    expect(stable).toContain('testID="stable-delete-account"');
    expect(stable).toContain('onCreateBot');
    expect(stable).toContain('testID="stable-create-bot"');

    // Settings is a main-footer control (outside moreOpen), not inside the More sheet.
    const moreOpenBlock = stable.slice(
      stable.indexOf('{moreOpen ? ('),
      stable.indexOf(') : (', stable.indexOf('{moreOpen ? (')),
    );
    expect(moreOpenBlock).toContain('stable-sign-out');
    expect(moreOpenBlock).toContain('stable-privacy-policy');
    expect(moreOpenBlock).toContain('stable-delete-account');
    expect(moreOpenBlock).not.toContain('stable-settings');

    const mainBlock = stable.slice(stable.indexOf(') : (', stable.indexOf('{moreOpen ? (')));
    expect(mainBlock).toContain('stable-settings');
    expect(mainBlock).toContain('stable-more');
    expect(mainBlock).not.toContain('stable-sign-out');

    // More is last among the primary main controls (settings precedes more).
    const settingsIdx = mainBlock.indexOf('stable-settings');
    const moreIdx = mainBlock.indexOf('stable-more');
    const createIdx = mainBlock.indexOf('stable-create-bot');
    expect(settingsIdx).toBeGreaterThan(-1);
    expect(moreIdx).toBeGreaterThan(settingsIdx);
    expect(createIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeLessThan(settingsIdx);
  });

  it('removes inert arm/paint tiles from the home hero', () => {
    const stable = readSource('src/garage/screens/StableScreen.tsx');
    expect(stable).not.toContain('WeaponGlyphSlot');
    expect(stable).not.toContain('stable-weapon');
    expect(stable).not.toContain('paintChip');
    expect(stable).not.toContain('Paint:');
  });
});
