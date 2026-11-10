import type { ListCandidatesResult, PrepareEligibilityResult } from './types';

/**
 * Opponent roster + allowance reads against the live Postgres contract.
 *
 * Live path uses ticket-B SECURITY DEFINER RPCs (`list_opponent_roster`,
 * `get_fight_allowance_summary`) plus `current_bot_loadouts` — never direct
 * table SELECTs on characters / fight_allowances. There is no ranking RPC yet
 * (level / freshness / anti-farming); clients join fight-ready opponents that
 * have a confirmed loadout, then rely on `prepare_fight_context` + combat-v1.
 */
export interface OpponentCandidatesPort {
  readonly kind: 'dev' | 'supabase' | 'unavailable';
  listCandidates(input: { accessToken: string; accountId: string }): Promise<ListCandidatesResult>;
  prepareEligibility(input: {
    accessToken: string;
    accountId: string;
    opponentId: string;
  }): Promise<PrepareEligibilityResult>;
}
