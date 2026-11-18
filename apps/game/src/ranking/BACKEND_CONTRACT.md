# Ranking live-read contract — E2 boards

Tickets: [E2 Ranking backend](https://app.clickup.com/t/1amjtrezaj2) · [D4 Ranking UI](https://app.clickup.com/t/1amjtrezaj9)

## Authoritative surfaces

| RPC                     | Args                | Success body                                                                                                                              |
| ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `list_bot_ranking()`    | none (`auth.uid()`) | `{ ok: true, tab: "bots", rows: [{ rank, botId, botName, botoreId, botoreName, wins, losses, totalXp, portrait, isCurrentBot, isNpc }] }` |
| `list_botore_ranking()` | none (`auth.uid()`) | `{ ok: true, tab: "botores", rows: [{ rank, botoreId, name, emblemId, wins, losses, botsOwned, isCurrentBotore, isNpc }] }`               |

- Migration: `supabase/migrations/0029_ranking_win_loss.sql` (E2 / #71)
- Docs: `docs/backend/ranking.md`
- `SECURITY DEFINER`, `EXECUTE` to **`authenticated` only**
- No account UUIDs in player-facing fields

## Legacy

`list_ranking()` (C5 / `0022_list_ranking.sql`) remains for older adapters. D4 uses the E2 tab RPCs.

## Client

- `SupabaseRankingReadAdapter` maps E2 rows → `RankingRow` / `BotoreRankingRow`.
- UI preserves adapter order; fixtures stay labelled DEV only in data provenance (`source`), never as on-screen “LIVE / DEV” chrome.
- Factory: `createRankingReadClient({ accessToken, captureScenario })`.
- Mini head paints on the botore tab join from the bot board when paints are not on the botore payload.
