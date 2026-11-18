# Sanctioned client read RPCs

Authenticated game-client reads for first-run (garage → confirm → fight)
**without** table `GRANT SELECT` on `characters` / `fight_allowances` /
`profiles`. Migration `0020_client_read_rpcs.sql`. ClickUp:
[B: Authenticated client read RPCs](https://app.clickup.com/t/1amjtrey2yc).

C3 adapters call these names directly (`apps/game/src/supabase/clientReadRpcs.ts`).

## Contract

| RPC                             | Args                | Success body                                                                                                     |
| ------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `get_owned_character()`         | none (`auth.uid()`) | `{ ok: true, characterId, displayName }`                                                                         |
| `list_opponent_roster()`        | none                | `{ ok: true, opponents: [{ characterId, displayName, botoreName, wins, losses }] }` (0033)                       |
| `get_fight_allowance_summary()` | none (`auth.uid()`) | E3: `{ ok, fightsRemaining, limit, scope, refillPolicy, nextRefillAt, utcDay, allowancesRemaining }` — see below |
| `list_ranking()`                | none (`auth.uid()`) | `{ ok: true, rows: [{ rank, characterId, displayName, isCurrentBot, totalXp }] }`                                |
| `list_bot_ranking()`            | none (`auth.uid()`) | `{ ok: true, tab: "bots", rows: [...] }` — see `docs/backend/ranking.md` (E2)                                    |
| `list_botore_ranking()`         | none (`auth.uid()`) | `{ ok: true, tab: "botores", rows: [...] }` — see `docs/backend/ranking.md` (E2)                                 |

### E3 fight quota (`get_fight_allowance_summary`)

Migration `0032_fight_quota_config.sql`. Config singleton
`fight_quota_config` (no `SELECT` for `authenticated`) drives:

| Field             | Now                                   | Later                                         |
| ----------------- | ------------------------------------- | --------------------------------------------- |
| `fightsRemaining` | unused slots today, capped by `limit` | same math under rolling                       |
| `limit`           | `3`                                   | raise without an app ship                     |
| `scope`           | `player`                              | `bot`                                         |
| `refillPolicy`    | `daily_utc_midnight`                  | `rolling_per_fight` (contract + fixtures)     |
| `nextRefillAt`    | next UTC midnight (`…T00:00:00Z`)     | earliest `used_at` + `rolling_refill_seconds` |

Compat: `allowancesRemaining` aliases `fightsRemaining`; `utcDay` remains.
Client UI (Opponents / Confirm) must derive the countdown only from
`nextRefillAt` — never hard-code “3” or “midnight”. **Carlos yes** required
before merging the migration.

### D8 roster enrichment (`list_opponent_roster`)

Migration `0033_list_opponent_roster_botore_record.sql` (**Carlos yes**
2026-11-18 on draft #84; E7/#88 takes **0034** next). Each opponent row
includes:

| Field           | Source                                                             |
| --------------- | ------------------------------------------------------------------ |
| `botoreName`    | `profiles.display_name` via `opponent_lanistas` (not `account_id`) |
| `wins`/`losses` | `bot_fight_records` coalesce 0                                     |

System opponents keep `characters.account_id` null (`opponents_unowned`).
Lanista links live in `opponent_lanistas` — no table `GRANT` to
`authenticated`. Local seed renames opponents to A5 names (Can Hook /
Cobalt Brute / Slab Mick) and seeds lanista mapping + W–L — seed only, not
hosted `db push`.

Failures: `{ ok: false, code?, message? }` or PostgREST HTTP error (`42501`).
After R5 soft-delete, `get_owned_character()` returns
`{ ok: false, code: 'account_deleted' }` when `accounts.deleted_at` is set
(migration `0024_account_deletion.sql`).

After B5 (`0027_ensure_player_character.sql`), `get_owned_character()`
**auto-provisions** a player character + starter loadout via
`ensure_player_character(auth.uid())` when none exists. Atlas Storage publish
is **not** required for that starter row.

`list_ranking` is migration `0022_list_ranking.sql` (C5). Ordering is
server-owned: player characters by `sum(progression_ledger.delta_xp)` desc,
then `character_id` asc; client must not re-sort.

E2 tab boards (`list_bot_ranking` / `list_botore_ranking`) are migration
`0029_ranking_win_loss.sql` (+ NPC seed in `supabase/seed.sql`). Full
field contracts and tie-breaks: `docs/backend/ranking.md`.

All are `SECURITY DEFINER` with `set search_path = public, extensions`.
`EXECUTE` is granted to **`authenticated` only** (revoked from `public`,
`anon`, and `service_role`). Account identity always comes from `auth.uid()` —
there is no account-id argument. No new table grants to `authenticated`.

## Already-sanctioned companions

| Surface                                          | Use                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `current_bot_loadouts`                           | Confirmed loadout once `characterId` is known. RLS uses `0021` SECURITY DEFINER helpers (`bot_character_owned_by_caller` / `bot_character_is_system_opponent`) so loadout reads do not need `GRANT SELECT` on `characters`.                     |
| `save_bot_loadout`                               | Persist loadout                                                                                                                                                                                                                                 |
| `prepare_fight_context(account_id, opponent_id)` | Eligibility + sealed builds (after opponent chosen). **EXECUTE:** `authenticated` (own `auth.uid()`) + `service_role` (`combat-v1`). PUBLIC/anon revoked (B4 / migration `0025`). Kept client-callable for Confirm eligibility — not Edge-only. |
| `combat-v1` Edge                                 | Fight compute + persist                                                                                                                                                                                                                         |

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
