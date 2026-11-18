/**
 * D2 — Result overlay on dimmed arena (replaces Fight Result route in flow).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildResultCardModel,
  botFightRecordFromRankingRow,
  formatRecordLine,
  formatResultContextLine,
  formatVsLine,
  resolveOutcomeKind,
} from '../src/result-overlay/resultCardModel';
import { RESULT_OVERLAY_DIM_OPACITY } from '../src/result-overlay/types';
import { resultCaptureRecord } from '../src/result-overlay/designCaptureRecords';
import {
  E2_BOT_RANKING_RPC_ENABLED,
  fetchCurrentBotFightRecord,
} from '../src/result-overlay/fetchCurrentBotFightRecord';
import {
  reduceResultOverlayShell,
  type ResultOverlayShellState,
} from '../src/result-overlay/resultOverlayShell';
import { shouldReopenResultOverlayOnBack } from '../src/fight-view/fightViewNavigation';
import { FIGHT_VIEW_KO_HOLD_MS } from '../src/fight-view/types';
import { nextRoute, prevRoute, ROUTE_FLOW } from '../src/first-run/routes';
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
    utcDay: '2026-11-17',
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

describe('D2 route flow — Result is not a linear step', () => {
  it('ROUTE_FLOW goes Replay → Ranking (FightResult capture-only)', () => {
    expect(ROUTE_FLOW).toEqual([
      'Stable',
      'Customise',
      'Opponents',
      'ConfirmFight',
      'Replay',
      'Ranking',
    ]);
    expect(nextRoute('Replay')).toBe('Ranking');
    expect(prevRoute('Ranking')).toBe('Replay');
    expect(ROUTE_FLOW).not.toContain('FightResult');
  });
});

describe('D2 result overlay shell reducer (behavioural)', () => {
  const firstWatch: ResultOverlayShellState = {
    route: 'Replay',
    fightViewMode: 'firstWatch',
    showResultOverlay: false,
  };

  it('KO handoff opens overlay once on Replay', () => {
    const open = reduceResultOverlayShell(firstWatch, { type: 'ko_handoff' });
    expect(open).toEqual({
      route: 'Replay',
      fightViewMode: 'firstWatch',
      showResultOverlay: true,
    });
    expect(reduceResultOverlayShell(open, { type: 'ko_handoff' }).showResultOverlay).toBe(true);
    expect(FIGHT_VIEW_KO_HOLD_MS).toBe(1000);
  });

  it('Watch again clears overlay and sets rewatch on Replay', () => {
    const afterKo = reduceResultOverlayShell(firstWatch, { type: 'ko_handoff' });
    expect(reduceResultOverlayShell(afterKo, { type: 'watch_again' })).toEqual({
      route: 'Replay',
      fightViewMode: 'rewatch',
      showResultOverlay: false,
    });
  });

  it('rewatch Back re-opens overlay without changing route', () => {
    const rewatch: ResultOverlayShellState = {
      route: 'Replay',
      fightViewMode: 'rewatch',
      showResultOverlay: false,
    };
    expect(reduceResultOverlayShell(rewatch, { type: 'rewatch_back' })).toEqual({
      route: 'Replay',
      fightViewMode: 'rewatch',
      showResultOverlay: true,
    });
    expect(shouldReopenResultOverlayOnBack('Replay', 'rewatch')).toBe(true);
    expect(shouldReopenResultOverlayOnBack('Replay', 'firstWatch')).toBe(false);
  });

  it('Stable / Ranking clear the overlay', () => {
    const open = reduceResultOverlayShell(firstWatch, { type: 'ko_handoff' });
    expect(reduceResultOverlayShell(open, { type: 'go_stable' }).showResultOverlay).toBe(false);
    expect(reduceResultOverlayShell(open, { type: 'go_stable' }).route).toBe('Stable');
    expect(reduceResultOverlayShell(open, { type: 'go_ranking' }).route).toBe('Ranking');
    expect(reduceResultOverlayShell(open, { type: 'go_ranking' }).showResultOverlay).toBe(false);
  });
});

describe('D2 KO hold → overlay wiring', () => {
  const slot = readSource('src/first-run/slots/ReplaySlot.tsx');

  it('shows Result overlay after KO hold instead of goNext / FightResult', () => {
    expect(slot).toContain('setShowResultOverlay(true)');
    expect(slot).toContain('FIGHT_VIEW_KO_HOLD_MS');
    expect(slot).toContain('ResultOverlay');
    expect(slot).toContain('ResultOverlayBand');
    expect(slot).not.toContain('handOffOnceRef.current = createOnceHandoff(() => goNext())');
  });

  it('pauses playback when the overlay opens (rewatch Back)', () => {
    expect(slot).toContain('playerRef.current?.pause()');
    expect(slot).toMatch(/showResultOverlay[\s\S]*?pause\(\)/);
  });

  it('registers Android hardware Back in rewatch to goBack()', () => {
    expect(slot).toContain('hardwareBackPress');
    expect(slot).toContain('goBack()');
    expect(slot).toMatch(/isRewatch[\s\S]*?goBack\(\)/);
  });

  it('passes safe-area topInset into ResultOverlay', () => {
    expect(slot).toContain('topInset={topInset}');
    const overlay = readSource('src/result-overlay/ResultOverlay.tsx');
    expect(overlay).toContain('topInset');
    expect(overlay).toContain('contentPadTop');
  });

  it('uses a translucent ~55–65% ink scrim (arena stays readable)', () => {
    expect(RESULT_OVERLAY_DIM_OPACITY).toBeGreaterThanOrEqual(0.55);
    expect(RESULT_OVERLAY_DIM_OPACITY).toBeLessThanOrEqual(0.65);
    const overlay = readSource('src/result-overlay/ResultOverlay.tsx');
    expect(overlay).toContain('RESULT_OVERLAY_DIM_OPACITY');
    expect(overlay).not.toMatch(/backgroundColor:\s*'#111'/);
    const captureSlot = readSource('src/first-run/slots/FightResultSlot.tsx');
    expect(captureSlot).toContain('CanonicalReplayPlayer');
    expect(captureSlot).toContain('arenaOverlay={arenaOverlay}');
  });

  it('keys anim/cues on fight only (not W–L) and gates E2 ranking RPC', () => {
    const overlay = readSource('src/result-overlay/ResultOverlay.tsx');
    expect(overlay).toContain('confirmed.replay.checksum');
    expect(overlay).not.toMatch(/fightKey = .*wins.*losses/);
    expect(E2_BOT_RANKING_RPC_ENABLED).toBe(false);
  });
});

describe('D2 result card model (player POV)', () => {
  it('maps attacker win to victory and never Winner:<id>', () => {
    const confirmed = confirmedStub({
      outcome: { reason: 'defeat', winner: 'player-hero', loser: 'opp-1' },
      newRecord: true,
    });
    expect(resolveOutcomeKind(confirmed)).toBe('victory');
    const card = buildResultCardModel(confirmed, {
      record: resultCaptureRecord('victory-new-record'),
      opponentBotoreName: 'Magistra Volta',
    });
    expect(card.outcomeKind).toBe('victory');
    expect(card.showNewRecord).toBe(true);
    expect(card.xpAwarded).toBe(24);
    expect(card.levelLabel).toBe('Level 4');
    expect(card.wins).toBe(12);
    expect(card.losses).toBe(6);
    expect(card.contextLine).toBe('Best win streak: 4');
    expect(card.vsLine).toBe('vs Sir Bot · Magistra Volta');
    expect(card.vsLine).not.toMatch(/player-hero|opp-1|battle|checksum/i);
  });

  it('maps attacker loss to defeat with streak-ended context', () => {
    const confirmed = confirmedStub({
      outcome: { reason: 'defeat', winner: 'opp-1', loser: 'player-hero' },
      xpAwarded: 8,
      newRecord: false,
    });
    expect(resolveOutcomeKind(confirmed)).toBe('defeat');
    const card = buildResultCardModel(confirmed, {
      record: resultCaptureRecord('defeat'),
      opponentBotoreName: 'Magistra Volta',
    });
    expect(card.outcomeKind).toBe('defeat');
    expect(card.showNewRecord).toBe(false);
    expect(card.xpAwarded).toBe(8);
    expect(card.contextLine).toBe('Streak ended at 3');
    expect(formatRecordLine(11, 7)).toBe('Record  11W – 7L');
  });

  it('maps action-limit draw without inventing a winner plate', () => {
    const confirmed = confirmedStub({
      outcome: {
        reason: 'action_limit_tiebreak',
        winner: null,
        loser: null,
        winnerByTiebreak: null,
      },
      xpAwarded: 1,
    });
    expect(resolveOutcomeKind(confirmed)).toBe('draw');
    const card = buildResultCardModel(confirmed);
    expect(card.outcomeKind).toBe('draw');
    expect(card.showNewRecord).toBe(false);
    const overlay = readSource('src/result-overlay/ResultOverlay.tsx');
    expect(overlay).toContain('DRAW');
    expect(overlay).toContain('accessibilityLabel="Draw"');
    expect(overlay).toContain('isDraw');
  });

  it('omits W–L / level / streak when E2 record is absent (no invent)', () => {
    const confirmed = confirmedStub({
      outcome: { reason: 'defeat', winner: 'player-hero', loser: 'opp-1' },
    });
    const card = buildResultCardModel(confirmed);
    expect(card.wins).toBeNull();
    expect(card.losses).toBeNull();
    expect(card.levelLabel).toBeNull();
    expect(card.contextLine).toBeNull();
    expect(formatVsLine('Sir Bot', null)).toBe('vs Sir Bot');
  });

  it('maps E2 ranking row into a fight-record snapshot', () => {
    expect(botFightRecordFromRankingRow({ wins: 5, losses: 2, totalXp: 10 })).toEqual({
      wins: 5,
      losses: 2,
      totalXp: 10,
    });
    expect(botFightRecordFromRankingRow({ wins: 'x', losses: 1 })).toBeNull();
  });

  it('skips list_bot_ranking while the E2 gate is off', async () => {
    let called = false;
    const record = await fetchCurrentBotFightRecord({
      config: { url: 'https://example.invalid', anonKey: 'anon' },
      accessToken: 'token',
      fetchImpl: (async () => {
        called = true;
        return new Response('{}', { status: 404 });
      }) as unknown as typeof fetch,
    });
    expect(record).toBeNull();
    expect(called).toBe(false);
  });

  it('formats context lines from optional streak fields only', () => {
    expect(formatResultContextLine('victory', { wins: 1, losses: 0, bestWinStreak: 4 })).toBe(
      'Best win streak: 4',
    );
    expect(formatResultContextLine('defeat', { wins: 1, losses: 1, streakEndedAt: 3 })).toBe(
      'Streak ended at 3',
    );
    expect(formatResultContextLine('victory', { wins: 1, losses: 0 })).toBeNull();
  });
});

describe('D2 overlay + band source guards', () => {
  it('overlay plays newRecord + xpTick cues and respects reduced motion', () => {
    const overlay = readSource('src/result-overlay/ResultOverlay.tsx');
    expect(overlay).toContain("playCue('newRecord')");
    expect(overlay).toContain("playCue('xpTick'");
    expect(overlay).toContain('XP_TICK_MIN_INTERVAL_MS');
    expect(overlay).toContain('reducedMotion');
    expect(overlay).not.toContain('battleId');
    expect(overlay).not.toContain('replayChecksum');
    expect(overlay).not.toContain('DomainNote');
  });

  it('band keeps Back to Stable / Watch again / Ranking testIDs', () => {
    const band = readSource('src/result-overlay/ResultOverlayBand.tsx');
    expect(band).toContain('result-stable');
    expect(band).toContain('result-watch');
    expect(band).toContain('result-ranking');
    expect(band).toContain('Back to Stable');
    expect(band).toContain('Watch again');
    expect(band).toContain('Ranking');
  });
});
