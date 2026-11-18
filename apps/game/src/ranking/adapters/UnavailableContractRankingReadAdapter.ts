import { RankingContractUnavailableError, type RankingReadPort } from '../RankingReadPort';
import type { BotoreRankingRow, RankingRow } from '../types';

/**
 * Stand-in when live Ranking RPCs cannot be reached (missing env / auth).
 */
export class UnavailableContractRankingReadAdapter implements RankingReadPort {
  readonly kind = 'unavailable' as const;

  constructor(private readonly message = 'Ranking contract is not available.') {}

  async list(): Promise<readonly RankingRow[]> {
    throw new RankingContractUnavailableError(this.message);
  }

  async listBotores(): Promise<readonly BotoreRankingRow[]> {
    throw new RankingContractUnavailableError(this.message);
  }
}
