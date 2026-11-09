import type { ListCandidatesResult, PrepareEligibilityResult } from './types';

/**
 * Opponent roster + allowance reads against the live Postgres contract.
 *
 * There is no dedicated candidate-ranking RPC yet (level / freshness /
 * anti-farming). Clients list system opponents (`characters.is_opponent`) that
 * have a confirmed loadout, then rely on `prepare_fight_context` + combat-v1
 * for eligibility. See internal/f9-backend-gaps.md.
 */
export interface OpponentCandidatesPort {
  readonly kind: 'dev' | 'supabase';
  listCandidates(input: { accessToken: string; accountId: string }): Promise<ListCandidatesResult>;
  prepareEligibility(input: {
    accessToken: string;
    accountId: string;
    opponentId: string;
  }): Promise<PrepareEligibilityResult>;
}
