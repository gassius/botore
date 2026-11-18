import type { RankingReadPort } from './RankingReadPort';
import { applyRankingLoadResult, beginRankingLoad, loadRankingFromPort } from './rankingSession';
import type { RankingSessionState, RankingTab } from './types';

export type RankingSessionSetter = (
  updater: (prev: RankingSessionState) => RankingSessionState,
) => void;

/**
 * Serialises ranking loads by generation so a slow earlier response cannot
 * overwrite a newer success/error. Loads the active tab (bots or botores).
 */
export function createRankingLoadController(
  port: RankingReadPort,
  setSession: RankingSessionSetter,
): {
  load: (tab?: RankingTab) => Promise<void>;
  /** Invalidate in-flight loads so a superseded port/controller cannot write. */
  dispose: () => void;
  /** Latest issued request id (for tests). */
  getGeneration: () => number;
} {
  let generation = 0;
  let disposed = false;

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
      let activeTab: RankingTab = 'bots';
      setSession((prev) => {
        activeTab = tab ?? prev.tab;
        return beginRankingLoad({ ...prev, tab: activeTab });
      });
      const result = await loadRankingFromPort(port, activeTab);
      if (disposed || requestId !== generation) {
        return;
      }
      setSession((prev) => applyRankingLoadResult(prev, result));
    },
  };
}
