/**
 * Authenticated client-read RPC contract (tickets B + C5).
 *
 * SECURITY DEFINER RPCs — no table GRANTs to authenticated on characters /
 * fight_allowances / profiles / progression_ledger. JSON keys match
 * prepare_fight_context (camelCase). Backend owns the SQL; this module is the
 * client-side name + payload contract.
 *
 * All are auth.uid()-scoped. Call with empty JSON body `{}`.
 * `get_fight_allowance_summary` / `list_ranking` take no client account arg.
 */

export const OWNED_CHARACTER_RPC = 'get_owned_character' as const;
export const OPPONENT_ROSTER_RPC = 'list_opponent_roster' as const;
export const FIGHT_ALLOWANCE_SUMMARY_RPC = 'get_fight_allowance_summary' as const;
/** C5 — player ranking by progression_ledger XP totals. */
export const LIST_RANKING_RPC = 'list_ranking' as const;

export type OwnedCharacterRpcOk = {
  readonly ok: true;
  readonly characterId: string;
  readonly displayName: string;
};

export type OpponentRosterEntry = {
  readonly characterId: string;
  readonly displayName: string;
};

export type OpponentRosterRpcOk = {
  readonly ok: true;
  readonly opponents: readonly OpponentRosterEntry[];
};

export type FightAllowanceSummaryRpcOk = {
  readonly ok: true;
  readonly utcDay: string;
  readonly allowancesRemaining: number;
};

export type ClientReadRpcFail = {
  readonly ok: false;
  readonly code?: string;
  readonly message?: string;
};

export type RankingRpcRow = {
  readonly rank: number;
  readonly characterId: string;
  readonly displayName: string;
  readonly isCurrentBot: boolean;
  readonly totalXp: number;
};

export type ListRankingRpcOk = {
  readonly ok: true;
  readonly rows: readonly RankingRpcRow[];
};
