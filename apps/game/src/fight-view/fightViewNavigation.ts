/**
 * Pure Fight View navigation helpers — unit-tested without mounting the slot.
 */
import type { FirstRunRoute } from '../first-run/routes';
import type { FightViewMode } from './types';

/**
 * Resolve where chrome / hardware Back should go.
 * `null` means stay put (noop). Otherwise return the destination route.
 */
export function resolveFirstRunGoBackTarget(
  route: FirstRunRoute,
  fightViewMode: FightViewMode,
  prev: FirstRunRoute | null,
): FirstRunRoute | null {
  // Settings is side-entry — Back always returns to Stable chrome.
  if (route === 'Settings') return 'Stable';
  // First watch: hardware / chrome back must not leave the fight.
  if (route === 'Replay' && fightViewMode === 'firstWatch') return null;
  // Rewatch back returns to Result, not ConfirmFight.
  if (route === 'Replay' && fightViewMode === 'rewatch') return 'FightResult';
  return prev;
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
