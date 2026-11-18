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
/** C5 — player ranking by progression_ledger XP totals (legacy board). */
export const LIST_RANKING_RPC = 'list_ranking' as const;
/** E2 — bot board with W–L, XP, portrait parts, botore name. */
export const LIST_BOT_RANKING_RPC = 'list_bot_ranking' as const;
/** E2 — botore board with emblem, aggregate W–L, bots owned. */
export const LIST_BOTORE_RANKING_RPC = 'list_botore_ranking' as const;

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

/**
 * E3 fight quota summary. `allowancesRemaining` / `utcDay` kept for compat;
 * UI should prefer fightsRemaining + nextRefillAt (no hard-coded limit/reset).
 */
export type FightAllowanceSummaryRpcOk = {
  readonly ok: true;
  readonly fightsRemaining: number;
  readonly limit: number;
  readonly scope: 'player' | 'bot';
  readonly refillPolicy: 'daily_utc_midnight' | 'rolling_per_fight';
  /** ISO-8601 UTC instant for the next refill clock. */
  readonly nextRefillAt: string;
  readonly utcDay: string;
  /** Alias of fightsRemaining (pre-E3 clients). */
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

export type BotRankingPortraitRpc = {
  readonly chassis: string | null;
  readonly paint: string | null;
  readonly weapon: string | null;
  readonly atlasVersion: string | null;
};

export type BotRankingRpcRow = {
  readonly rank: number;
  readonly botId: string;
  readonly botName: string;
  readonly botoreId: string;
  readonly botoreName: string;
  readonly wins: number;
  readonly losses: number;
  readonly totalXp: number;
  readonly portrait: BotRankingPortraitRpc | null;
  readonly isCurrentBot: boolean;
  readonly isNpc?: boolean;
};

export type ListBotRankingRpcOk = {
  readonly ok: true;
  readonly tab: 'bots';
  readonly rows: readonly BotRankingRpcRow[];
};

export type BotoreRankingRpcRow = {
  readonly rank: number;
  readonly botoreId: string;
  readonly name: string;
  readonly emblemId: string;
  readonly wins: number;
  readonly losses: number;
  readonly botsOwned: number;
  readonly isCurrentBotore: boolean;
  readonly isNpc?: boolean;
};

export type ListBotoreRankingRpcOk = {
  readonly ok: true;
  readonly tab: 'botores';
  readonly rows: readonly BotoreRankingRpcRow[];
};
