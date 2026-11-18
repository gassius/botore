import type { BotoreRankingRow, RankingRow } from './types';

/**
 * Read port for Ranking boards.
 * Live adapter: E2 `list_bot_ranking` / `list_botore_ranking`.
 * Ordering is entirely server-owned — never re-sort client-side.
 */
export interface RankingReadPort {
  /** Bot board (W–L, XP, portrait parts, botore name). */
  list(): Promise<readonly RankingRow[]>;
  /** Botore board (emblem, aggregate W–L, bots owned). */
  listBotores(): Promise<readonly BotoreRankingRow[]>;
}

export class RankingContractUnavailableError extends Error {
  readonly code = 'ranking_contract_unavailable' as const;

  constructor(message: string) {
    super(message);
    this.name = 'RankingContractUnavailableError';
  }
}

export class RankingTransportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RankingTransportError';
    this.code = code;
  }
}
