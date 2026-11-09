# Ranking live-read contract — `list_ranking`

Ticket: [C5 Ranking screen: real data + design captures](https://app.clickup.com/t/1amjtrey13p)

## Authoritative surface

| RPC              | Args                | Success body                                                                 |
| ---------------- | ------------------- | ---------------------------------------------------------------------------- |
| `list_ranking()` | none (`auth.uid()`) | `{ ok: true, rows: [{ rank, characterId, displayName, isCurrentBot, totalXp }] }` |

- Migration: `supabase/migrations/0022_list_ranking.sql`
- Seed peers (local/CI board density): `1002_seed_ranking_peers.sql`
- `SECURITY DEFINER`, `set search_path = public, extensions`
- `EXECUTE` to **`authenticated` only** (revoked from `public`, `anon`, `service_role`)
- No table `GRANT SELECT` on `characters` / `progression_ledger` / `profiles`

## Ordering semantics (server-owned)

1. Player characters only (`is_opponent = false`).
2. Order by `sum(progression_ledger.delta_xp)` descending, then `character_id` ascending.
3. `rank` is `row_number()` in that order (1-based). Characters with no ledger rows have `totalXp = 0`.
4. Window: top 50 rows. First-run seed + live XP keep the board small.
5. XP awards remain the existing combat rules (win = 2, loss = 1). This RPC does **not** invent Elo, REF-03 sample ranks, or client-side reordering.

## Client

- `SupabaseRankingReadAdapter` maps `characterId` → `RankingRow.botId`, `source: 'live'`.
- UI preserves adapter order; fixtures stay labelled **DEV** when used for empty/error capture states.
- Factory: `createRankingReadClient({ accessToken, captureScenario })`.

## Verify

```bash
pnpm db:reset
# SQL suite includes TEST-OK C5 list_ranking…
psql "$DATABASE_URL" -c "select public.list_ranking()
  from (select set_config('request.jwt.claim.role','authenticated',true),
               set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)) s;"
```
