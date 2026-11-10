import type { RankingRow } from './types';

/**
 * Authoritative ranking read boundary.
 *
 * Implementations return rows already ordered for display. Callers must
 * preserve that order — no client-side sort, score invent, or rank rewrite.
 *
 * Live adapter: `SupabaseRankingReadAdapter` → `list_ranking` RPC.
 * See `BACKEND_CONTRACT.md` in this folder.
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

/** Thrown for network / auth transport failures (C10) — not empty boards. */
export class RankingTransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RankingTransportError';
  }
}
