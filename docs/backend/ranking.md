# Ranking API (E2)

ClickUp: [E2 Ranking backend](https://app.clickup.com/t/1amjtrezaj2)

Win-loss is **derived** from server-confirmed `battles.winner_id` (via
`battle_participants`). XP remains `sum(progression_ledger.delta_xp)`.
Player-facing payloads never include account UUIDs.

## Schema (migration `0029`)

| Column / object | Purpose |
| --- | --- |
| `accounts.is_npc` | NPC botore flag (seeded ranking density) |
| `profiles.botore_id` | Stable text botore id (unique when set) |
| `profiles.emblem_id` | Emblem asset/key for botore rows |
| `characters.owner_is_npc` | Allows 1–3 bots per NPC botore |
| `bot_fight_records` | Per-bot wins/losses view |
| `admin_bot_ranking` / `admin_botore_ranking` | Dashboard reuse (`service_role`) |

Humans still have at most one player character
(`one_character_per_human_player`). NPC accounts may own multiple.

## Client RPCs (`EXECUTE` authenticated only)

### `list_bot_ranking()`

```json
{
  "ok": true,
  "tab": "bots",
  "rows": [
    {
      "rank": 1,
      "botId": "npc-bot-rivet",
      "botName": "Rivet",
      "botoreId": "npc-steel-yard",
      "botoreName": "Steel Yard",
      "wins": 5,
      "losses": 0,
      "totalXp": 10,
      "portrait": {
        "chassis": "chassis-basic",
        "paint": "paint-crimson",
        "weapon": "weapon-sword",
        "atlasVersion": "v1"
      },
      "isCurrentBot": false,
      "isNpc": true
    }
  ]
}
```

**Order:** wins desc → totalXp desc → losses asc → botId asc. Top 50.
Excludes `is_opponent` characters and soft-deleted accounts.

### `list_botore_ranking()`

```json
{
  "ok": true,
  "tab": "botores",
  "rows": [
    {
      "rank": 1,
      "botoreId": "npc-steel-yard",
      "name": "Steel Yard",
      "emblemId": "emblem-cog",
      "wins": 10,
      "losses": 2,
      "botsOwned": 3,
      "isCurrentBotore": false,
      "isNpc": true
    }
  ]
}
```

**Order:** wins desc → losses asc → botsOwned desc → botoreId asc. Top 50.

### Legacy `list_ranking()` (C5)

Unchanged XP-only board for the current live Ranking adapter. Prefer the E2
tab RPCs for new Bot / Botore UI work.

## NPC seed (migration `1003`)

Idempotent seed of **12** NPC botores with **1–3** bots each (paint/weapon
variation from the proof catalogue), flagged `is_npc`, plus synthetic
confirmed battles and matching progression ledger rows. Applies on hosted
`db push` (unlike local-only `seed.sql`).

## Verify

```bash
pnpm env:up
pnpm db:reset
# SQL suite includes TEST-OK E2 ranking…
psql "$DATABASE_URL" -c "select public.list_bot_ranking()
  from (select set_config('request.jwt.claim.role','authenticated',true),
               set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)) s;"
```
