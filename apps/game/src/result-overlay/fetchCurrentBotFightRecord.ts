/**
 * Optional E2 W–L read for the Result overlay.
 * Calls `list_bot_ranking` and maps the caller's current bot row.
 * Missing RPC / auth / malformed body → null (never invent W–L).
 *
 * Gate: `E2_BOT_RANKING_RPC_ENABLED` stays false until E2 (#71) lands on this
 * stack — calling a missing RPC on every overlay open is a guaranteed 404.
 */
import type { SupabasePublicConfig } from '../garage/auth/supabasePublicConfig';
import { botFightRecordFromRankingRow } from './resultCardModel';
import type { BotFightRecordSnapshot } from './types';

const LIST_BOT_RANKING_RPC = 'list_bot_ranking';

/**
 * Flip to true when migration `0029_ranking_win_loss` / `list_bot_ranking` is
 * on the Fight View stack tip. Until then, skip the network round-trip.
 */
export const E2_BOT_RANKING_RPC_ENABLED = false;

type ListBotRankingOk = {
  readonly ok: true;
  readonly rows: readonly Record<string, unknown>[];
};

export async function fetchCurrentBotFightRecord(input: {
  readonly config: SupabasePublicConfig;
  readonly accessToken: string;
  readonly fetchImpl?: typeof fetch;
  /** Test override — defaults to {@link E2_BOT_RANKING_RPC_ENABLED}. */
  readonly enabled?: boolean;
}): Promise<BotFightRecordSnapshot | null> {
  const enabled = input.enabled ?? E2_BOT_RANKING_RPC_ENABLED;
  if (!enabled) return null;

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${input.config.url}/rest/v1/rpc/${LIST_BOT_RANKING_RPC}`, {
      method: 'POST',
      headers: {
        apikey: input.config.anonKey,
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ListBotRankingOk | { ok?: false } | null;
    if (!body || body.ok !== true || !Array.isArray(body.rows)) return null;
    const current = body.rows.find((row) => row['isCurrentBot'] === true);
    if (!current) return null;
    return botFightRecordFromRankingRow(current);
  } catch {
    return null;
  }
}
