import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePaintVisual } from '../src/assembler/paints';
import { PROOF_PAINTS, PROOF_WEAPONS } from '../src/garage/loadout/proofCatalogue';
import { CUSTOMISE_CAROUSEL } from '../src/garage-tag/snap/snapMetrics';

const ROOT = process.cwd();

function readSource(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('D6 Create Bot view', () => {
  it('keeps name max 12 and CreateBot route wired from Ludus', () => {
    const screen = readSource('src/garage/screens/CreateBotScreen.tsx');
    expect(screen).toContain('NAME_MAX = 12');
    expect(screen).toContain('create-bot-name');
    expect(screen).toContain('create-bot-reroll');
    expect(screen).toContain('create-bot-submit');
    expect(screen).toContain('create-bot-helper');
    expect(screen).toContain('suggestBotName');
    expect(screen).toContain('createOwnedBot');

    const slot = readSource('src/first-run/slots/CreateBotSlot.tsx');
    expect(slot).toContain('CreateBotScreen');
    expect(slot).toContain("goTo('Stable')");

    const stableSlot = readSource('src/first-run/slots/StableSlot.tsx');
    expect(stableSlot).toContain("goTo('CreateBot')");
  });

  it('starting paints are solids only; weapons reuse Customise snap metrics', () => {
    const solids = PROOF_PAINTS.filter((p) => resolvePaintVisual(p.uiAlias).kind === 'solid');
    expect(solids.length).toBeGreaterThanOrEqual(3);
    expect(solids.every((p) => resolvePaintVisual(p.uiAlias).kind === 'solid')).toBe(true);
    expect(PROOF_WEAPONS.length).toBeGreaterThanOrEqual(3);
    expect(CUSTOMISE_CAROUSEL.visibleCount).toBe(3);
    expect(CUSTOMISE_CAROUSEL.viewportClip).toBe(337);
  });

  it('does not put character ids in player-facing Create Bot copy', () => {
    const screen = readSource('src/garage/screens/CreateBotScreen.tsx');
    expect(screen).not.toMatch(/characterId/);
    expect(screen).not.toMatch(/player-hero/);
    expect(screen).toContain('Your Ludus is full');
  });
});
