/**
 * Prefer F9 lastFight when it carries a validateable sealed replay + sealed builds.
 * Standalone proof screens may fall back to labelled DEV golden (XP withheld) only
 * when DEV scaffolds are allowed. First-run shell must use
 * resolveFirstRunConfirmedResult (no silent fixture robots).
 */
import type { FightSuccess } from '../fight/request/types';
import { isDevScaffoldAllowed } from '../runtime/devScaffoldPolicy';
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
 * Otherwise fall back to labelled DEV golden fixture (XP withheld) when scaffolds
 * are allowed. Returns null when playable builds are fail-closed.
 * Prefer `resolveFirstRunConfirmedResult` for the integrated shell.
 */
export function resolveSessionConfirmedResult(
  lastFight: FightSuccess | null | undefined,
  goldenIndex = 0,
): ConfirmedFightResult | null {
  const confirmed = tryConfirmedResultFromFight(lastFight);
  if (confirmed) return confirmed;
  if (!isDevScaffoldAllowed()) return null;
  return loadDevGoldenConfirmedResult(goldenIndex);
}
