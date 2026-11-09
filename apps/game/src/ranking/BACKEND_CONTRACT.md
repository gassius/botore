# Ranking live-read contract — BLOCKED

Ticket: [1amjtrey0ex](https://app.clickup.com/t/1amjtrey0ex)

This scaffolding ships a `RankingReadPort` and DEV fixture adapter only.
**Live/production ranking integration is blocked** until a verified authoritative
backend read contract exists. Do not invent an API, RPC, table, RLS policy, or
client ranking algorithm to unblock this screen.

## Verified in this repo (2026-11-08)

Searched `supabase/`, `docs/`, and client packages for ranking / leaderboard
endpoints, RPCs, views, and schemas: **none found**.

There is therefore no authorized production ordering, pagination, auth/RLS, or
score semantics for the client to consume.

## Missing backend scope (handoff)

A separate backend ticket should define and implement, with Supabase Infra /
Carlos approval as required:

1. **Authoritative read surface** — Edge Function, Postgres RPC, or secured view
   that returns ordered ranking rows for the authenticated player.
2. **Auth / RLS** — who may read which rows; no client write path to invent ranks.
3. **Ordering semantics** — server-owned order the client must preserve verbatim
   (no client re-sort). Rank field values come from the server.
4. **Pagination / windowing** — if the list is large: cursor/limit contract,
   including how the current bot’s row is included when outside the window.
5. **Row shape** — at minimum: rank, bot identity (stable id + display name),
   ownership/current-bot flag (or enough data for the client to label “YOU”
   without using paint alone). No XP/reward invention from REF-03 samples.
6. **Idempotency / freshness** — refresh semantics; failure must not fabricate
   live results.

Until that contract is verified with the backend implementer, wire only:

- `FixtureRankingReadAdapter` (DEV-labelled fixtures)
- `UnavailableContractRankingReadAdapter` (explicit blocked state)

## Client invariants (already enforced in scaffolding)

- `RankingReadPort.list()` returns rows in display order; UI does not sort.
- Fixtures are labelled **DEV** and never presented as live players.
- Loading / empty / error+retry / unavailable-contract / populated states are
  explicit; prior readable rows stay coherent on refresh failure.
