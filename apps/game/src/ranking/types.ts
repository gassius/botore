/**
 * Ranking read model for the first-run Ranking screen.
 *
 * Ordering and rank values are owned by the read port / backend.
 * The client must not invent a ranking algorithm or reorder rows.
 */

/** Provenance of ranking rows — fixtures are never presented as live players. */
export type RankingDataSource = 'dev-fixture';

export type RankingRow = {
  /** Server- or fixture-provided rank position. Do not recompute client-side. */
  rank: number;
  botId: string;
  displayName: string;
  /** Ownership / current-bot cue — use with label/shape, not paint alone. */
  isCurrentBot: boolean;
  /** Always 'dev-fixture' until a verified live RankingReadPort exists. */
  source: RankingDataSource;
};

export type RankingPhase =
  'idle' | 'loading' | 'populated' | 'empty' | 'error' | 'unavailable_contract';

export type RankingSessionState = {
  phase: RankingPhase;
  /** Last successfully read rows; kept coherent across refresh failures. */
  rows: readonly RankingRow[];
  errorMessage: string | null;
  /** True while a refresh is in flight and prior rows remain visible. */
  refreshing: boolean;
};

export type RankingLoadResult =
  | { kind: 'ok'; rows: readonly RankingRow[] }
  | { kind: 'unavailable_contract'; message: string }
  | { kind: 'error'; message: string };
