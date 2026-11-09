/**
 * Prefer F9 lastFight when it carries a validateable sealed replay.
 * Otherwise fall back to DEV golden fixture (XP withheld).
 */
import type { FightSuccess } from '../fight/request/types';
import { confirmedResultFromFightSuccess, type ConfirmedFightResult } from './confirmedResult';
import { loadDevGoldenConfirmedResult } from './loadDevReplay';

export function resolveSessionConfirmedResult(
  lastFight: FightSuccess | null | undefined,
  goldenIndex = 0,
): ConfirmedFightResult {
  if (!lastFight) {
    return loadDevGoldenConfirmedResult(goldenIndex);
  }
  try {
    return confirmedResultFromFightSuccess(lastFight);
  } catch {
    // F9 DEV scaffold replay is not a sealed BattleReplay — keep fixture path.
    return loadDevGoldenConfirmedResult(goldenIndex);
  }
}
