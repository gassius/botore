/**
 * E1 — Fight end flow after KO (reconcile with D2 #78 / D4 #80).
 * D10 SoT for Result overlay copy: Back to Ludus / Watch again / Ranking.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createOnceHandoff,
  shouldReopenResultOverlayOnBack,
  shouldScheduleKoHandoff,
} from '../src/fight-view/fightViewNavigation';
import { FIGHT_VIEW_KO_HOLD_MS } from '../src/fight-view/types';
import { nextRoute, ROUTE_FLOW } from '../src/first-run/routes';
import { BACK_TO_LUDUS_LABEL, RANKING_LABEL, WATCH_AGAIN_LABEL } from '../src/result-overlay/copy';
import { buildResultCardModel } from '../src/result-overlay/resultCardModel';
import {
  reduceResultOverlayShell,
  type ResultOverlayShellState,
} from '../src/result-overlay/resultOverlayShell';
import type { ConfirmedFightResult } from '../src/replay/confirmedResult';

function readSource(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

const fighters = [
  { characterId: 'player-hero', displayName: 'Chispa', weaponKind: 'sword' as const },
  { characterId: 'opp-1', displayName: 'Sir Bot', weaponKind: 'sword' as const },
];

function confirmedStub(
  overrides: Partial<ConfirmedFightResult> & {
    readonly outcome: ConfirmedFightResult['outcome'];
  },
): ConfirmedFightResult {
  return {
    source: 'server',
    serverConfirmed: true,
    battleId: 'battle-hidden',
    rulesVersion: 'combat-v1',
    replayChecksum: 'checksum-hidden',
    xpAwarded: 24,
    allowancesRemaining: 2,
    utcDay: '2026-11-18',
    persistence: 'persisted',
    newRecord: null,
    media: { environmentVersion: 'v001', kitVersion: 'v002' },
    builds: {
      attacker: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
      },
      defender: {
        chassis: 'chassis-basic',
        paint: 'paint-cobalt',
        weapon: 'weapon-sword',
      },
    },
    replay: {
      battleId: 'battle-hidden',
      rulesVersion: 'combat-v1',
      checksum: 'checksum-hidden',
      seed: '0',
      fighters: fighters as never,
      events: [],
      outcome: overrides.outcome,
    } as never,
    label: 'CONFIRMED',
    ...overrides,
  };
}

describe('E1 Result overlay copy (D10 SoT)', () => {
  it('exposes a single Back to Ludus / Watch again / Ranking source', () => {
    expect(BACK_TO_LUDUS_LABEL).toBe('Back to Ludus');
    expect(WATCH_AGAIN_LABEL).toBe('Watch again');
    expect(RANKING_LABEL).toBe('Ranking');
    const copy = readSource('src/result-overlay/copy.ts');
    const band = readSource('src/result-overlay/ResultOverlayBand.tsx');
    expect(copy).toContain("BACK_TO_LUDUS_LABEL = 'Back to Ludus'");
    expect(band).toContain('BACK_TO_LUDUS_LABEL');
    expect(band).toContain('WATCH_AGAIN_LABEL');
    expect(band).toContain('RANKING_LABEL');
    expect(band).not.toContain('Back to Stable');
    expect(band).not.toMatch(/['"]Continue['"]/);
  });
});

describe('E1 first-watch KO → overlay (no dead end)', () => {
  const firstWatch: ResultOverlayShellState = {
    route: 'Replay',
    fightViewMode: 'firstWatch',
    showResultOverlay: false,
  };

  it('schedules KO handoff only on first watch', () => {
    expect(shouldScheduleKoHandoff('firstWatch')).toBe(true);
    expect(shouldScheduleKoHandoff('rewatch')).toBe(false);
    expect(FIGHT_VIEW_KO_HOLD_MS).toBe(1000);
  });

  it('opens overlay after KO hold once (victory or defeat)', () => {
    vi.useFakeTimers();
    const handOff = vi.fn(() => {
      /* once-handoff target */
    });
    const once = createOnceHandoff(handOff);
    expect(shouldScheduleKoHandoff('firstWatch')).toBe(true);
    const timer = setTimeout(once, FIGHT_VIEW_KO_HOLD_MS);
    vi.advanceTimersByTime(FIGHT_VIEW_KO_HOLD_MS - 1);
    expect(handOff).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    once();
    expect(handOff).toHaveBeenCalledTimes(1);
    clearTimeout(timer);
    vi.useRealTimers();

    const open = reduceResultOverlayShell(firstWatch, { type: 'ko_handoff' });
    expect(open.showResultOverlay).toBe(true);
    expect(open.route).toBe('Replay');
  });

  it('maps victory and defeat card outcomes without player-facing ids', () => {
    const victory = buildResultCardModel(
      confirmedStub({
        outcome: { reason: 'defeat', winner: 'player-hero', loser: 'opp-1' },
      }),
    );
    const defeat = buildResultCardModel(
      confirmedStub({
        outcome: { reason: 'defeat', winner: 'opp-1', loser: 'player-hero' },
        xpAwarded: 8,
      }),
    );
    expect(victory.outcomeKind).toBe('victory');
    expect(defeat.outcomeKind).toBe('defeat');
    expect(victory.vsLine).not.toMatch(/player-hero|opp-1|battle|checksum/i);
    expect(defeat.vsLine).not.toMatch(/player-hero|opp-1|battle|checksum/i);
  });

  it('Continue / Replay / Ranking leave Fight View without a second result route', () => {
    const open = reduceResultOverlayShell(firstWatch, { type: 'ko_handoff' });
    expect(reduceResultOverlayShell(open, { type: 'go_stable' })).toEqual({
      route: 'Stable',
      fightViewMode: 'firstWatch',
      showResultOverlay: false,
    });
    expect(reduceResultOverlayShell(open, { type: 'watch_again' })).toEqual({
      route: 'Replay',
      fightViewMode: 'rewatch',
      showResultOverlay: false,
    });
    expect(reduceResultOverlayShell(open, { type: 'go_ranking' })).toEqual({
      route: 'Ranking',
      fightViewMode: 'firstWatch',
      showResultOverlay: false,
    });
    expect(shouldReopenResultOverlayOnBack('Replay', 'rewatch')).toBe(true);
  });
});

describe('E1 reconcile with #78 / #80 — no parallel result route', () => {
  it('ROUTE_FLOW skips FightResult; Replay linear next is Ranking', () => {
    expect(ROUTE_FLOW).not.toContain('FightResult');
    expect(nextRoute('Replay')).toBe('Ranking');
  });

  it('ReplaySlot wires KO hold → ResultOverlay + Ludus band actions', () => {
    const slot = readSource('src/first-run/slots/ReplaySlot.tsx');
    expect(slot).toContain('setShowResultOverlay(true)');
    expect(slot).toContain('FIGHT_VIEW_KO_HOLD_MS');
    expect(slot).toContain('ResultOverlay');
    expect(slot).toContain('ResultOverlayBand');
    expect(slot).toContain("goTo('Stable')");
    expect(slot).toContain("setFightViewMode('rewatch')");
    expect(slot).toContain("goTo('Ranking')");
    expect(slot).not.toContain('handOffOnceRef.current = createOnceHandoff(() => goNext())');
    expect(slot).not.toMatch(/goNext\(\)\s*;?\s*\/\/.*[Kk][Oo]/);
  });

  it('FightResult stays capture-only with the same Ludus band', () => {
    const capture = readSource('src/first-run/slots/FightResultSlot.tsx');
    expect(capture).toContain('ResultOverlay');
    expect(capture).toContain('ResultOverlayBand');
    expect(capture).toContain("goTo('Stable')");
    expect(capture).toContain("goTo('Ranking')");
    expect(capture).toContain("goTo('Replay')");
    expect(capture).toContain('confirmedResultForResultCapture');
    expect(capture).toContain('resultCaptureScenario');
  });
});

describe('E1 design-capture victory/defeat fixtures', () => {
  it('forces player-POV victory and defeat for FightResult stills', async () => {
    const { confirmedResultForResultCapture } = await import(
      '../src/result-overlay/designCaptureRecords'
    );
    const { resolveOutcomeKind } = await import('../src/result-overlay/resultCardModel');
    const victory = confirmedResultForResultCapture('victory');
    const defeat = confirmedResultForResultCapture('defeat');
    expect(resolveOutcomeKind(victory)).toBe('victory');
    expect(resolveOutcomeKind(defeat)).toBe('defeat');
    expect(victory.serverConfirmed).toBe(true);
    expect(defeat.xpAwarded).toBe(8);
  });
});
