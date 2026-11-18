import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { SESSION_FAILURE_COPY } from '../../session-failure';
import { RankingTransportError, type RankingReadPort } from '../RankingReadPort';
import {
  DEV_EMPTY_BOTORE_ROWS,
  DEV_EMPTY_RANKING_ROWS,
  DEV_POPULATED_BOTORE_ROWS,
  DEV_POPULATED_RANKING_ROWS,
} from '../fixtures/devRankingFixtures';
import type { BotoreRankingRow, RankingRow } from '../types';

function sanitizeRankingRows(rows: readonly RankingRow[]): readonly RankingRow[] {
  return rows.map((row) => ({
    ...row,
    displayName: playerFacingDisplayName(row.displayName),
    botoreName: playerFacingDisplayName(row.botoreName),
  }));
}

function sanitizeBotoreRows(rows: readonly BotoreRankingRow[]): readonly BotoreRankingRow[] {
  return rows.map((row) => ({
    ...row,
    name: playerFacingDisplayName(row.name),
  }));
}

export type FixtureRankingScenario = 'populated' | 'empty' | 'error' | 'offline' | 'auth_expired';

export type FixtureRankingReadAdapterOptions = {
  scenario?: FixtureRankingScenario;
  /** Optional override bot rows (still treated as DEV fixtures). */
  rows?: readonly RankingRow[];
  /** Optional override botore rows. */
  botoreRows?: readonly BotoreRankingRow[];
  /** Artificial latency for loading-state demos (ms). */
  delayMs?: number;
  /** Custom error message when scenario === 'error'. */
  errorMessage?: string;
};

/**
 * Fixture-backed RankingReadPort for scaffolding.
 * Always returns DEV rows — never live players.
 */
export class FixtureRankingReadAdapter implements RankingReadPort {
  private readonly scenario: FixtureRankingScenario;
  private readonly rows: readonly RankingRow[];
  private readonly botoreRows: readonly BotoreRankingRow[];
  private readonly delayMs: number;
  private readonly errorMessage: string;

  constructor(options: FixtureRankingReadAdapterOptions = {}) {
    this.scenario = options.scenario ?? 'populated';
    this.rows = options.rows ?? DEV_POPULATED_RANKING_ROWS;
    this.botoreRows = options.botoreRows ?? DEV_POPULATED_BOTORE_ROWS;
    this.delayMs = options.delayMs ?? 0;
    this.errorMessage = options.errorMessage ?? 'Could not load ranking.';
  }

  private async settle(): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.delayMs);
      });
    }
    if (this.scenario === 'offline') {
      throw new RankingTransportError('network_error', SESSION_FAILURE_COPY.offline.detail);
    }
    if (this.scenario === 'auth_expired') {
      throw new RankingTransportError('unauthenticated', SESSION_FAILURE_COPY.auth_expired.detail);
    }
    if (this.scenario === 'error') {
      throw new Error(this.errorMessage);
    }
  }

  async list(): Promise<readonly RankingRow[]> {
    await this.settle();
    if (this.scenario === 'empty') {
      return sanitizeRankingRows(DEV_EMPTY_RANKING_ROWS);
    }
    return sanitizeRankingRows(this.rows);
  }

  async listBotores(): Promise<readonly BotoreRankingRow[]> {
    await this.settle();
    if (this.scenario === 'empty') {
      return sanitizeBotoreRows(DEV_EMPTY_BOTORE_ROWS);
    }
    return sanitizeBotoreRows(this.botoreRows);
  }
}
