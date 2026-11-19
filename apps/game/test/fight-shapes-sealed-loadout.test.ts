/**
 * Fight shapes vs Customise — sealed builds must carry A4 shape slots.
 * Without head/body/arms/legs, ShapeKit falls back to stock visor (rounded helmet).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assemblerLoadoutFromBuild } from '../src/replay/fighterLoadout';
import { sealedBuildWithCharacterId } from '../src/fight/selectedBotFightIdentity';
import type { SealedFightBuildSnapshot } from '../src/fight/request/types';

const gameRoot = process.cwd();

describe('fight sealed shapes (Customise loadout parity)', () => {
  it('SealedFightBuildSnapshot type declares A4 shape slots', () => {
    const src = readFileSync(join(gameRoot, 'src/fight/request/types.ts'), 'utf8');
    expect(src).toMatch(/readonly head\?:/);
    expect(src).toMatch(/readonly body\?:/);
    expect(src).toMatch(/readonly arms\?:/);
    expect(src).toMatch(/readonly legs\?:/);
  });

  it('FightSessionContext seals head/body/arms/legs from confirmed + opponent', () => {
    const src = readFileSync(join(gameRoot, 'src/fight/FightSessionContext.tsx'), 'utf8');
    expect(src).toMatch(/head:\s*confirmed\.head/);
    expect(src).toMatch(/body:\s*confirmed\.body/);
    expect(src).toMatch(/arms:\s*confirmed\.arms/);
    expect(src).toMatch(/legs:\s*confirmed\.legs/);
    expect(src).toMatch(/head:\s*opponent\.loadout\.head/);
    expect(src).toMatch(/body:\s*opponent\.loadout\.body/);
    expect(src).toMatch(/arms:\s*opponent\.loadout\.arms/);
    expect(src).toMatch(/legs:\s*opponent\.loadout\.legs/);
  });

  it('assemblerLoadoutFromBuild preserves welder head through sealed → assemble path', () => {
    const sealed: SealedFightBuildSnapshot = sealedBuildWithCharacterId(
      {
        chassis: 'chassis-basic',
        paint: 'paint-cobalt',
        weapon: 'weapon-axe',
        head: 'head-welder',
        body: 'body-boiler',
        arms: 'arms-heavy',
        legs: 'legs-piston',
      },
      'bot-glint-aegis',
    );
    const loadout = assemblerLoadoutFromBuild(sealed);
    expect(loadout.head).toBe('head-welder');
    expect(loadout.body).toBe('body-boiler');
    expect(loadout.arms).toBe('arms-heavy');
    expect(loadout.legs).toBe('legs-piston');
    expect(loadout.paint).toBe('paint-cobalt');
  });

  it('missing shape slots stay null (stock ShapeKit) — not invented', () => {
    const loadout = assemblerLoadoutFromBuild({
      chassis: 'chassis-basic',
      paint: 'paint-crimson',
      weapon: 'weapon-sword',
    });
    expect(loadout.head).toBeNull();
    expect(loadout.body).toBeNull();
    expect(loadout.arms).toBeNull();
    expect(loadout.legs).toBeNull();
  });
});

describe('Ludus W–L refresh after fight', () => {
  it('ReplaySlot Back to Ludus calls refreshOwnedBots before Stable', () => {
    const src = readFileSync(join(gameRoot, 'src/first-run/slots/ReplaySlot.tsx'), 'utf8');
    expect(src).toContain('refreshOwnedBots');
    expect(src).toMatch(
      /onBackToStable=\{\(\)\s*=>\s*\{[\s\S]*?void refreshOwnedBots\(\);[\s\S]*?goTo\('Stable'\)/,
    );
  });

  it('FightResultSlot Back to Ludus calls refreshOwnedBots', () => {
    const src = readFileSync(join(gameRoot, 'src/first-run/slots/FightResultSlot.tsx'), 'utf8');
    expect(src).toContain('refreshOwnedBots');
    expect(src).toMatch(
      /onBackToStable=\{\(\)\s*=>\s*\{[\s\S]*?void refreshOwnedBots\(\);[\s\S]*?goTo\('Stable'\)/,
    );
  });

  it('StableScreen still has no mount refreshOwnedBots (PRR M2)', () => {
    const src = readFileSync(join(gameRoot, 'src/garage/screens/StableScreen.tsx'), 'utf8');
    expect(src).not.toMatch(/useEffect\(\(\)\s*=>\s*\{\s*void refreshOwnedBots\(\)/);
  });
});
