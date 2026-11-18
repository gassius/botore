import type { RankingReadPort } from './RankingReadPort';
import { applyRankingLoadResult, beginRankingLoad, loadRankingFromPort } from './rankingSession';
import type { RankingSessionState, RankingTab } from './types';

export type RankingSessionSetter = (
  updater: (prev: RankingSessionState) => RankingSessionState,
) => void;

/**
 * Serialises ranking loads by generation so a slow earlier response cannot
 * overwrite a newer success/error. Loads the active tab (bots or botores).
 *
 * Tab is resolved *before* `setSession` — never assigned inside a React
 * updater (React 18 may defer applying it, which would leave Botores loading
 * bots via `list()` instead of `listBotores()`).
 */
export function createRankingLoadController(
  port: RankingReadPort,
  setSession: RankingSessionSetter,
  initialTab: RankingTab = 'bots',
): {
  load: (tab?: RankingTab) => Promise<void>;
  /** Invalidate in-flight loads so a superseded port/controller cannot write. */
  dispose: () => void;
  /** Latest issued request id (for tests). */
  getGeneration: () => number;
} {
  let generation = 0;
  let disposed = false;
  /** Mirrored tab for refresh/retry when caller omits `tab`. */
  let currentTab: RankingTab = initialTab;

  return {
    getGeneration: () => generation,
    dispose: () => {
      disposed = true;
      generation += 1;
    },
    load: async (tab) => {
      if (disposed) {
        return;
      }
      const requestId = ++generation;
      const activeTab: RankingTab = tab ?? currentTab;
      currentTab = activeTab;
      setSession((prev) => beginRankingLoad({ ...prev, tab: activeTab }));
      const result = await loadRankingFromPort(port, activeTab);
      if (disposed || requestId !== generation) {
        return;
      }
      setSession((prev) => applyRankingLoadResult(prev, result));
    },
  };
}
