/**
 * Prefer F9 lastFight when it carries a validateable sealed replay + sealed builds.
 * Standalone proof screens may fall back to DEV golden (XP withheld).
 * First-run shell must use resolveFirstRunConfirmedResult (no silent fixture robots).
 */
import type { FightSuccess } from '../fight/request/types';
import type { ConfirmedFightResult } from './confirmedResult';
import { loadDevGoldenConfirmedResult } from './loadDevReplay';
import { tryConfirmedResultFromFight } from './serverPlayback';

export {
  isServerPlaybackReady,
  resolveFirstRunConfirmedResult,
  tryConfirmedResultFromFight,
} from './serverPlayback';
export type { FirstRunResultBlockReason, FirstRunResultResolution } from './serverPlayback';

/**
 * Prefer F9 lastFight when it carries a validateable sealed replay.
 * Otherwise fall back to DEV golden fixture (XP withheld).
 * Prefer `resolveFirstRunConfirmedResult` for the integrated shell.
 */
export function resolveSessionConfirmedResult(
  lastFight: FightSuccess | null | undefined,
  goldenIndex = 0,
): ConfirmedFightResult {
  const confirmed = tryConfirmedResultFromFight(lastFight);
  if (confirmed) return confirmed;
  return loadDevGoldenConfirmedResult(goldenIndex);
}
