# ADR-0007: Supabase locally, selected Edge/database-function deployment

Status: **accepted, amended 2026-11-08** · Original: 2026-08-24

This is the dedicated amendment. The original “plain PostgreSQL is an
equivalent no-change replacement” promise is **withdrawn**.

## Context

Local development must stay reproducible without cloud accounts. The 24 August
2026 decision treated managed Supabase, self-hosted Supabase, and vanilla
Postgres plus replacement auth/storage as equivalent deployments, with
provider-specific code isolated in `apps/api` adapters.

The 7 November 2026 kickoff selected **Supabase Edge Functions** for fight
computation and **Postgres database functions** for atomic persistence. That
couples the gameplay server to the Supabase runtime, Auth, Storage, and
`pg_cron`. Leaving the original promise “accepted” contradicted the selected
stack.

## Decision (amended)

### Still in force

- The **Supabase CLI** (pinned devDependency) is canonical for local
  Postgres/Auth/Storage. It is never exposed publicly.
- Migrations are **ordinary PostgreSQL SQL** files in `supabase/migrations/`.
- Domain/combat packages (`packages/{rng,domain,replay,combat-engine}`) import
  **no** provider, framework, IO, or clock code (CI-enforced). That core stays
  portable.

### Amended — selected deployment

| Concern        | Selected location                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Fight compute  | Supabase Edge Function; `combat-v1` in-process                                                                            |
| CSPRNG seed    | That Edge Function (do not add new CSPRNG sites)                                                                          |
| Atomic persist | Postgres **database function**: idempotency, `SKIP LOCKED` allowance, battle/replay/rewards/outbox in **one transaction** |
| Outbox drain   | **`pg_cron`** (optionally invoking an Edge Function). Not a Fastify worker                                                |
| Media          | Supabase Storage prefix **`atlas/vN/`** (versioned manifests, PNGs, masks, geometry, separate audio)                      |
| Auth           | Supabase Auth; gameplay commands terminate at the Edge Function, not PostgREST writes                                     |

`apps/api` is **not** the current adapter location. Leftover Fastify
`apps/api` / `apps/worker` are bootstrap remnants; do not extend them.

### What is not portable without adaptation

Switching provider requires new work for: Edge runtime, Auth verification,
Storage (`atlas/vN/`), database functions, and `pg_cron` scheduling. **Plain
PostgreSQL alone is not an equivalent replacement** for the entire
deployment. A no-change provider switch is **not** promised.

Self-hosting Supabase remains possible in principle and transfers backups,
upgrades, security, monitoring, and availability to the team. Accept that
only after load/backup runbooks exist (see `docs/runbooks/operations.md`).

## Consequences

- `supabase db reset` remains the local byte-fresh database path.
- Implementers follow `docs/architecture/overview.md` for the Edge /
  database-function / `atlas/vN/` / `pg_cron` shape.
- Export/restore drills stay required before production.
- Do not copy the original no-change portability wording into new work.

## Notes

TypeBox contracts (ADR-0003) and modular-monolith cohesion without
microservices (ADR-0004) are unchanged. ADR-0006 (Fastify) remains superseded.
This amendment does not invent an RPC signature, Edge Function path, or
migration, and does not claim those have shipped.
