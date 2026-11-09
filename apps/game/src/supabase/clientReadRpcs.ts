/**
 * Authenticated client-read RPC contract for ticket B (ClickUp 1amjtrey2yc).
 *
 * SECURITY DEFINER RPCs — no table GRANTs to authenticated on characters /
 * fight_allowances / profiles. JSON keys match prepare_fight_context (camelCase).
 * Backend owns the SQL; this module is the client-side name + payload contract.
 *
 * Owned character + roster: empty body `{}` (auth.uid()).
 * Allowance summary: send `p_account_id` equal to the JWT account (B enforces
 * equality and queries auth.uid() only).
 */

export const OWNED_CHARACTER_RPC = 'get_owned_character' as const;
export const OPPONENT_ROSTER_RPC = 'list_opponent_roster' as const;
export const FIGHT_ALLOWANCE_SUMMARY_RPC = 'get_fight_allowance_summary' as const;

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
