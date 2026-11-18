/**
 * Design-capture / preview fixtures for Result overlay W–L + XP bar.
 * Never used as live server truth — E2 ranking rows own production W–L.
 */
import type { ConfirmedFightResult } from '../replay/confirmedResult';
import { loadDevGoldenConfirmedResult } from '../replay/loadDevReplay';
import type { BotFightRecordSnapshot } from './types';

export type ResultCaptureScenario = 'victory-new-record' | 'victory' | 'defeat';

export function parseResultCaptureScenario(
  raw: string | null | undefined,
): ResultCaptureScenario | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'victory-new-record' || v === 'victory_new' || v === 'new-record') {
    return 'victory-new-record';
  }
  if (v === 'victory' || v === 'win') return 'victory';
  if (v === 'defeat' || v === 'loss') return 'defeat';
  return null;
}

/**
 * Design-capture only — sealed golden replay with player-POV outcome forced for
 * victory/defeat Result overlay stills (action band evidence). Not live truth.
 */
export function confirmedResultForResultCapture(
  scenario: ResultCaptureScenario,
): ConfirmedFightResult {
  const base = loadDevGoldenConfirmedResult(0);
  const fighters = base.replay.fighters;
  const playerId = fighters[0]?.characterId ?? 'player-hero';
  const opponentId = fighters[1]?.characterId ?? 'opp-1';
  const isDefeat = scenario === 'defeat';
  const winner = isDefeat ? opponentId : playerId;
  const loser = isDefeat ? playerId : opponentId;
  return {
    ...base,
    // Capture stills need XP / plate reviewable like a confirmed fight.
    source: 'server',
    serverConfirmed: true,
    xpAwarded: isDefeat ? 8 : 24,
    // D10 Result mockup: "Fights remaining: 1"
    allowancesRemaining: 1,
    utcDay: '2026-11-18',
    persistence: 'persisted',
    newRecord: scenario === 'victory-new-record' ? true : null,
    outcome: { reason: 'defeat', winner, loser },
    label: 'CONFIRMED',
  };
}

/** Fixture snapshots matching apk-2026-11-18 D10 Result mockup numbers. */
export function resultCaptureRecord(scenario: ResultCaptureScenario): BotFightRecordSnapshot {
  if (scenario === 'defeat') {
    return {
      wins: 11,
      losses: 7,
      level: 4,
      // Design-capture ToTT / Result stills — same streak figure as D10 review pack.
      streakEndedAt: 3,
      xpBarOldRatio: 0.56,
      xpBarNewRatio: 0.64,
    };
  }
  if (scenario === 'victory-new-record') {
    return {
      wins: 13,
      losses: 6,
      level: 4,
      bestWinStreak: 3,
      xpBarOldRatio: 0.56,
      xpBarNewRatio: 0.78,
    };
  }
  // d10-fight-end-result.png — Record 13W – 6L · Best win streak 3 · Level 4
  return {
    wins: 13,
    losses: 6,
    level: 4,
    bestWinStreak: 3,
    xpBarOldRatio: 0.56,
    xpBarNewRatio: 0.78,
  };
}
