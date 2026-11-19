/**
 * Pure Fight View navigation helpers — unit-tested without mounting the slot.
 */
import type { FirstRunRoute } from '../first-run/routes';
import type { FightViewMode } from './types';

/**
 * Resolve where chrome / hardware Back should go.
 * `null` means stay put (noop). Otherwise return the destination route.
 *
 * D2: rewatch Back re-opens the in-arena Result overlay (handled by ReplaySlot /
 * FirstRunContext) — it must not navigate to a separate FightResult route.
 */
export function resolveFirstRunGoBackTarget(
  route: FirstRunRoute,
  fightViewMode: FightViewMode,
  prev: FirstRunRoute | null,
): FirstRunRoute | null {
  // Ludus side-entry surfaces — Back always returns to Stable (Ludus).
  // Customise / CreateBot / Settings are never under Opponents.
  if (route === 'Settings' || route === 'Customise' || route === 'CreateBot') {
    return 'Stable';
  }
  // Find opponent is opened from Ludus — never walk back into Customise
  // even if a stale linear prev still names it.
  if (route === 'Opponents') return 'Stable';
  // First watch: hardware / chrome back must not leave the fight.
  if (route === 'Replay' && fightViewMode === 'firstWatch') return null;
  // Rewatch back stays on Replay; caller shows the Result overlay in-place.
  if (route === 'Replay' && fightViewMode === 'rewatch') return null;
  return prev;
}

/** True when rewatch Back should re-open the D2 Result overlay (stay on Replay). */
export function shouldReopenResultOverlayOnBack(
  route: FirstRunRoute,
  fightViewMode: FightViewMode,
): boolean {
  return route === 'Replay' && fightViewMode === 'rewatch';
}

/**
 * Where leaving Ranking lands. `resultOverlay` is the in-arena Result on Replay;
 * `FightResult` is the capture deep-link Result route.
 */
export type RankingReturnTarget = 'Stable' | 'resultOverlay' | 'FightResult';

/** Record the Ranking origin at the moment the player opens it. */
export function rankingReturnTargetFor(
  route: FirstRunRoute,
  showResultOverlay: boolean,
): RankingReturnTarget {
  if (route === 'Replay' && showResultOverlay) return 'resultOverlay';
  if (route === 'FightResult') return 'FightResult';
  return 'Stable';
}

/** Route + overlay state to restore when leaving Ranking. */
export function resolveRankingExit(target: RankingReturnTarget): {
  readonly route: FirstRunRoute;
  readonly showResultOverlay: boolean;
} {
  switch (target) {
    case 'resultOverlay':
      return { route: 'Replay', showResultOverlay: true };
    case 'FightResult':
      return { route: 'FightResult', showResultOverlay: false };
    case 'Stable':
      return { route: 'Stable', showResultOverlay: false };
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

/** First watch schedules the KO → Result handoff; rewatch never does. */
export function shouldScheduleKoHandoff(mode: FightViewMode): boolean {
  return mode === 'firstWatch';
}

/** Fire `handOff` at most once (guards double-finish / remount races). */
export function createOnceHandoff(handOff: () => void): () => void {
  let armed = false;
  return () => {
    if (armed) return;
    armed = true;
    handOff();
  };
}
