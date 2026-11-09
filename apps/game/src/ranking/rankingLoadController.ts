import type { RankingReadPort } from './RankingReadPort';
import { applyRankingLoadResult, beginRankingLoad, loadRankingFromPort } from './rankingSession';
import type { RankingSessionState } from './types';

export type RankingSessionSetter = (
  updater: (prev: RankingSessionState) => RankingSessionState,
) => void;

/**
 * Serialises ranking loads by generation so a slow earlier response cannot
 * overwrite a newer success/error. Callers should also disable Refresh/Retry
 * while a load is in flight for UX, but generation ignore is the correctness gate.
 */
export function createRankingLoadController(
  port: RankingReadPort,
  setSession: RankingSessionSetter,
): {
  load: () => Promise<void>;
  /** Latest issued request id (for tests). */
  getGeneration: () => number;
} {
  let generation = 0;

  return {
    getGeneration: () => generation,
    load: async () => {
      const requestId = ++generation;
      setSession((prev) => beginRankingLoad(prev));
      const result = await loadRankingFromPort(port);
      if (requestId !== generation) {
        return;
      }
      setSession((prev) => applyRankingLoadResult(prev, result));
    },
  };
}
