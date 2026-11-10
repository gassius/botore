# Sanctioned client read RPCs

Authenticated game-client reads for first-run (garage → confirm → fight)
**without** table `GRANT SELECT` on `characters` / `fight_allowances` /
`profiles`. Migration `0020_client_read_rpcs.sql`. ClickUp:
[B: Authenticated client read RPCs](https://app.clickup.com/t/1amjtrey2yc).

C3 adapters call these names directly (`apps/game/src/supabase/clientReadRpcs.ts`).

## Contract

| RPC                             | Args                | Success body                                                                      |
| ------------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| `get_owned_character()`         | none (`auth.uid()`) | `{ ok: true, characterId, displayName }`                                          |
| `list_opponent_roster()`        | none                | `{ ok: true, opponents: [{ characterId, displayName }] }`                         |
| `get_fight_allowance_summary()` | none (`auth.uid()`) | `{ ok: true, utcDay, allowancesRemaining }`                                       |
| `list_ranking()`                | none (`auth.uid()`) | `{ ok: true, rows: [{ rank, characterId, displayName, isCurrentBot, totalXp }] }` |

Failures: `{ ok: false, code?, message? }` or PostgREST HTTP error (`42501`).
After R5 soft-delete, `get_owned_character()` returns
`{ ok: false, code: 'account_deleted' }` when `accounts.deleted_at` is set
(migration `0024_account_deletion.sql`).

`list_ranking` is migration `0022_list_ranking.sql` (C5). Ordering is
server-owned: player characters by `sum(progression_ledger.delta_xp)` desc,
then `character_id` asc; client must not re-sort.

All are `SECURITY DEFINER` with `set search_path = public, extensions`.
`EXECUTE` is granted to **`authenticated` only** (revoked from `public`,
`anon`, and `service_role`). Account identity always comes from `auth.uid()` —
there is no account-id argument. No new table grants to `authenticated`.

## Already-sanctioned companions

| Surface                                          | Use                                                                                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `current_bot_loadouts`                           | Confirmed loadout once `characterId` is known. RLS uses `0021` SECURITY DEFINER helpers (`bot_character_owned_by_caller` / `bot_character_is_system_opponent`) so loadout reads do not need `GRANT SELECT` on `characters`. |
| `save_bot_loadout`                               | Persist loadout                                                                                                                                                                                                             |
| `prepare_fight_context(account_id, opponent_id)` | Eligibility + sealed builds (after opponent chosen)                                                                                                                                                                         |
| `combat-v1` Edge                                 | Fight compute + persist                                                                                                                                                                                                     |

## Client call sites

- Owned character → garage loadout save / preview
- Opponent roster + allowance summary → Confirm dual-bot chrome; loadouts still
  from `current_bot_loadouts`
- Ranking board → `SupabaseRankingReadAdapter` / `createRankingReadClient`
- Do **not** `SELECT` from `characters` or `fight_allowances` in the game client

## Negative tests (db)

- Cross-account isolation: exhausted caller still sees `allowancesRemaining = 0`
  even when another account has unused slots
- Anon / service_role: no `EXECUTE` on any of the three RPCs
- Missing JWT / empty role: body gate raises `42501`

## Verify

```bash
pnpm db:reset
# SQL suite includes TEST-OK B client-read…
psql "$DATABASE_URL" -c "select public.get_owned_character()
  from (select set_config('request.jwt.claim.role','authenticated',true),
               set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)) s;"
```
