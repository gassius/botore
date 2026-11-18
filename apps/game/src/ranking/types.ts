/**
 * Ranking read model for the Ranking screen (D4 / E2).
 *
 * Ordering and rank values are owned by the read port / backend.
 * The client must not invent a ranking algorithm or reorder rows.
 */

/** Provenance of ranking rows — fixtures are never presented as live players. */
export type RankingDataSource = 'dev-fixture' | 'live';

/** Segmented board tab (mustard = active in UI). */
export type RankingTab = 'bots' | 'botores';

/** Portrait parts from E2 `list_bot_ranking` (paint drives head look). */
export type RankingPortraitParts = {
  readonly chassis: string | null;
  readonly paint: string | null;
  readonly weapon: string | null;
  readonly atlasVersion: string | null;
};

/**
 * Bot board row (E2 `list_bot_ranking`).
 * `displayName` is the bot name (caps in UI); `botoreName` sits below.
 */
export type RankingRow = {
  /** Server- or fixture-provided rank position. Do not recompute client-side. */
  rank: number;
  botId: string;
  /** Bot display name — never a platform / account id. */
  displayName: string;
  /** Owning botore display name. */
  botoreName: string;
  wins: number;
  losses: number;
  /** Ownership / current-bot cue — use with label/shape, not paint alone. */
  isCurrentBot: boolean;
  /** 'live' from list_bot_ranking; 'dev-fixture' otherwise. */
  source: RankingDataSource;
  /** Server XP total (progression_ledger sum). */
  totalXp: number;
  portrait: RankingPortraitParts | null;
  /** Stable botore id for joining mini-heads on the botore board (not shown in UI). */
  botoreId: string;
};

/** Botore board row (E2 `list_botore_ranking`). */
export type BotoreRankingRow = {
  rank: number;
  botoreId: string;
  name: string;
  emblemId: string;
  wins: number;
  losses: number;
  botsOwned: number;
  /**
   * Paint ids for mini head stack (from bot board join when available).
   * Length may be less than botsOwned when paints are unknown.
   */
  botPaints: readonly string[];
  isCurrentBotore: boolean;
  source: RankingDataSource;
};

export type RankingPhase =
  'idle' | 'loading' | 'populated' | 'empty' | 'error' | 'unavailable_contract';

export type RankingSessionState = {
  phase: RankingPhase;
  tab: RankingTab;
  /** Last successfully read bot rows; kept coherent across refresh failures. */
  botRows: readonly RankingRow[];
  /** Last successfully read botore rows. */
  botoreRows: readonly BotoreRankingRow[];
  errorMessage: string | null;
  /** Machine code for errorMessage (network_error / unauthenticated / …). */
  errorCode: string | null;
  /** True while a refresh is in flight and prior rows remain visible. */
  refreshing: boolean;
};

/** @deprecated Prefer botRows — kept as alias for older call sites during D4. */
export type RankingLoadRows = readonly RankingRow[];

export type RankingLoadResult =
  | { kind: 'ok'; tab: 'bots'; rows: readonly RankingRow[] }
  | { kind: 'ok'; tab: 'botores'; rows: readonly BotoreRankingRow[] }
  | { kind: 'unavailable_contract'; message: string }
  | { kind: 'error'; message: string; code?: string };
