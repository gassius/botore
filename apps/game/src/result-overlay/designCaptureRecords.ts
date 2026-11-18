/**
 * Design-capture / preview fixtures for Result overlay W–L + XP bar.
 * Never used as live server truth — E2 ranking rows own production W–L.
 */
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

/** Fixture snapshots matching apk-2026-11-17 mockup numbers (names are mock data). */
export function resultCaptureRecord(scenario: ResultCaptureScenario): BotFightRecordSnapshot {
  if (scenario === 'defeat') {
    return {
      wins: 11,
      losses: 7,
      level: 4,
      xpBarOldRatio: 0.56,
      xpBarNewRatio: 0.64,
      streakEndedAt: 3,
    };
  }
  if (scenario === 'victory-new-record') {
    return {
      wins: 12,
      losses: 6,
      level: 4,
      xpBarOldRatio: 0.56,
      xpBarNewRatio: 0.78,
      bestWinStreak: 4,
    };
  }
  return {
    wins: 12,
    losses: 6,
    level: 4,
    xpBarOldRatio: 0.56,
    xpBarNewRatio: 0.78,
    bestWinStreak: 3,
  };
}
