import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACK_TO_STABLE_LABEL,
  LUDUS_DELETE_ACCOUNT_PATH,
  STABLE_HOME_TITLE,
} from '../src/garage/stableHomeCopy';

const ROOT = process.cwd();

function readSource(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('E5 Ludus home nav + Sign out under More (D5 mockup IA)', () => {
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
    // E1/D10 SoT: result-overlay/copy.ts owns Back to Ludus; E5 keeps STABLE_HOME_TITLE for Ludus chrome.
    expect(band).toContain('BACK_TO_LUDUS_LABEL');
    expect(band).not.toContain('"Back to Stable"');
    expect(band).not.toContain("'Back to Stable'");

    const routes = readSource('src/first-run/routes.ts');
    expect(routes).toContain('Stable: STABLE_HOME_TITLE');
  });

  it('main footer: Customise / Find opponent / Settings|More; Sign out only in More sheet', () => {
    const stable = readSource('src/garage/screens/StableScreen.tsx');

    expect(stable).toContain('testID="stable-settings"');
    expect(stable).toContain('testID="stable-more"');
    expect(stable).toContain('testID="stable-sign-out"');
    expect(stable).toContain('testID="stable-privacy-policy"');
    expect(stable).toContain('testID="stable-delete-account"');
    expect(stable).toContain('testID="stable-more-sheet"');
    expect(stable).toContain('styles.row2');

    // Create Bot is carousel slot (E4/D5), not a main footer button.
    expect(stable).not.toContain('testID="stable-create-bot"');
    expect(stable).toContain('LudusBotCarousel');
    expect(stable).toContain('ludus-bots-counter');
    expect(stable).toContain('onCreateBot');

    // Sign out / Privacy / Delete live in the More sheet, not the main footer stack.
    const footerBlock = stable.slice(
      stable.indexOf('const footer = ('),
      stable.indexOf('return (', stable.indexOf('const footer = (')),
    );
    expect(footerBlock).toContain('stable-settings');
    expect(footerBlock).toContain('stable-more');
    expect(footerBlock).not.toContain('stable-sign-out');
    expect(footerBlock).not.toContain('stable-privacy-policy');

    const sheetBlock = stable.slice(stable.indexOf('stable-more-sheet'));
    expect(sheetBlock).toContain('stable-sign-out');
    expect(sheetBlock).toContain('stable-privacy-policy');
    expect(sheetBlock).toContain('stable-delete-account');
    expect(sheetBlock).toContain('MORE_SIGN_OUT');

    const settingsIdx = footerBlock.indexOf('stable-settings');
    const moreIdx = footerBlock.indexOf('stable-more');
    expect(settingsIdx).toBeGreaterThan(-1);
    expect(moreIdx).toBeGreaterThan(settingsIdx);
  });

  it('removes inert arm/paint tiles from the home hero', () => {
    const stable = readSource('src/garage/screens/StableScreen.tsx');
    expect(stable).not.toContain('WeaponGlyphSlot');
    expect(stable).not.toContain('stable-weapon');
    expect(stable).not.toContain('paintChip');
    expect(stable).not.toContain('Paint:');
  });

  it('wires Ranking into More from StableSlot', () => {
    const slot = readSource('src/first-run/slots/StableSlot.tsx');
    expect(slot).toContain('onRanking');
    expect(slot).toContain("goTo('Ranking')");
  });

  it('player-facing delete path uses Ludus → More → Delete account', () => {
    expect(LUDUS_DELETE_ACCOUNT_PATH).toBe('Ludus → More → Delete account');
    const privacy = readSource('src/legal/privacyPolicyContent.ts');
    expect(privacy).toContain('LUDUS_DELETE_ACCOUNT_PATH');
    expect(privacy).not.toMatch(/Stable → Delete account/);
    const publicDelete = readSource('src/garage/screens/PublicAccountDeleteScreen.tsx');
    expect(publicDelete).toContain('LUDUS_DELETE_ACCOUNT_PATH');
    expect(publicDelete).not.toMatch(/Stable → Delete account/);
  });

  it('More sheet pads bottom with safe-area inset', () => {
    const stable = readSource('src/garage/screens/StableScreen.tsx');
    expect(stable).toContain('useSafeAreaInsets');
    expect(stable).toContain('paddingBottom: 20 + insets.bottom');
  });
});
