import { RankingContractUnavailableError, type RankingReadPort } from '../RankingReadPort';
import type { RankingRow } from '../types';

/**
 * Stand-in for a future live RankingReadPort.
 *
 * Live/production integration is BLOCKED until a verified authoritative
 * ranking read contract exists. This adapter makes that failure explicit
 * instead of inventing an API.
 */
export class UnavailableContractRankingReadAdapter implements RankingReadPort {
  async list(): Promise<readonly RankingRow[]> {
    throw new RankingContractUnavailableError(
      'Live ranking read is blocked: no verified authoritative ranking endpoint/RPC, auth/RLS, ordering, or pagination contract exists yet. See apps/game/src/ranking/BACKEND_CONTRACT.md.',
    );
  }
}
