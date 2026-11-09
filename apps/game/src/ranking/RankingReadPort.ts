import type { RankingRow } from './types';

/**
 * Authoritative ranking read boundary.
 *
 * Implementations return rows already ordered for display. Callers must
 * preserve that order — no client-side sort, score invent, or rank rewrite.
 *
 * Live/production adapter is BLOCKED until a verified backend ranking
 * endpoint/RPC (auth/RLS, ordering, pagination) exists. See
 * `BACKEND_CONTRACT.md` in this folder.
 */
export interface RankingReadPort {
  list(): Promise<readonly RankingRow[]>;
}

/** Thrown when no verified live ranking contract is available. */
export class RankingContractUnavailableError extends Error {
  readonly code = 'RANKING_CONTRACT_UNAVAILABLE' as const;

  constructor(message = 'Authoritative ranking read contract is not available') {
    super(message);
    this.name = 'RankingContractUnavailableError';
  }
}
