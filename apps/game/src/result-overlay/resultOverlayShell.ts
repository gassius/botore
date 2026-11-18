/**
 * Pure Result-overlay shell transitions — unit-tested without mounting RN.
 */
import type { FightViewMode } from '../fight-view/types';
import type { FirstRunRoute } from '../first-run/routes';

export type ResultOverlayShellState = {
  readonly route: FirstRunRoute;
  readonly fightViewMode: FightViewMode;
  readonly showResultOverlay: boolean;
};

export type ResultOverlayShellAction =
  | { readonly type: 'ko_handoff' }
  | { readonly type: 'watch_again' }
  | { readonly type: 'rewatch_back' }
  | { readonly type: 'go_stable' }
  | { readonly type: 'go_ranking' }
  | { readonly type: 'go_to'; readonly route: FirstRunRoute };

/**
 * Reduce first-run Result overlay + Fight View mode without React.
 * KO open is once-handoff at the call site; this reducer is idempotent on open.
 */
export function reduceResultOverlayShell(
  state: ResultOverlayShellState,
  action: ResultOverlayShellAction,
): ResultOverlayShellState {
  switch (action.type) {
    case 'ko_handoff':
      // First-watch KO hold → overlay on Replay (never a FightResult route).
      if (state.route !== 'Replay') return state;
      return { ...state, showResultOverlay: true };
    case 'watch_again':
      return {
        route: 'Replay',
        fightViewMode: 'rewatch',
        showResultOverlay: false,
      };
    case 'rewatch_back':
      if (state.route !== 'Replay' || state.fightViewMode !== 'rewatch') return state;
      return { ...state, showResultOverlay: true };
    case 'go_stable':
      return { ...state, route: 'Stable', showResultOverlay: false };
    case 'go_ranking':
      return { ...state, route: 'Ranking', showResultOverlay: false };
    case 'go_to': {
      const keepOverlay = action.route === 'Replay' || action.route === 'FightResult';
      return {
        ...state,
        route: action.route,
        showResultOverlay: keepOverlay ? state.showResultOverlay : false,
      };
    }
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
