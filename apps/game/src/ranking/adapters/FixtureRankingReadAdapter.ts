import { RankingTransportError, type RankingReadPort } from '../RankingReadPort';
import { DEV_EMPTY_RANKING_ROWS, DEV_POPULATED_RANKING_ROWS } from '../fixtures/devRankingFixtures';
import type { RankingRow } from '../types';

export type FixtureRankingScenario =
  | 'populated'
  | 'empty'
  | 'error'
  | 'offline'
  | 'auth_expired';

export type FixtureRankingReadAdapterOptions = {
  scenario?: FixtureRankingScenario;
  /** Optional override rows (still treated as DEV fixtures). */
  rows?: readonly RankingRow[];
  /** Artificial latency for loading-state demos (ms). */
  delayMs?: number;
  /** Custom error message when scenario === 'error'. */
  errorMessage?: string;
};

/**
 * Fixture-backed RankingReadPort for scaffolding.
 * Always returns DEV-labelled rows — never live players.
 */
export class FixtureRankingReadAdapter implements RankingReadPort {
  private readonly scenario: FixtureRankingScenario;
  private readonly rows: readonly RankingRow[];
  private readonly delayMs: number;
  private readonly errorMessage: string;

  constructor(options: FixtureRankingReadAdapterOptions = {}) {
    this.scenario = options.scenario ?? 'populated';
    this.rows = options.rows ?? DEV_POPULATED_RANKING_ROWS;
    this.delayMs = options.delayMs ?? 0;
    this.errorMessage = options.errorMessage ?? 'DEV fixture ranking load failed';
  }

  async list(): Promise<readonly RankingRow[]> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.delayMs);
      });
    }

    if (this.scenario === 'offline') {
      throw new RankingTransportError('network_error', 'Design-capture ranking offline state');
    }
    if (this.scenario === 'auth_expired') {
      throw new RankingTransportError(
        'unauthenticated',
        'Design-capture ranking auth-expired state',
      );
    }

    if (this.scenario === 'error') {
      throw new Error(this.errorMessage);
    }

    if (this.scenario === 'empty') {
      return DEV_EMPTY_RANKING_ROWS;
    }

    // Preserve adapter order exactly — no sort.
    return this.rows;
  }
}
