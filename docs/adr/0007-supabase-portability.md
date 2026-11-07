# ADR-0007: Supabase locally, PostgreSQL everywhere, adapters at the edge

Status: accepted · **portability promise in conflict — dedicated amendment pending** · Date: 2026-08-24

**Supersession note (8 November 2026) — amendment not complete:**

The selected server deployment uses **Supabase Edge Functions** and
**Postgres database functions**. Pure combat/domain packages remain portable.
The rest of the deployment does not: other providers require runtime, auth,
storage and operations adaptation. Plain PostgreSQL alone is not an
equivalent replacement for the entire deployment. `apps/api` is **not** the
current adapter location. A no-change provider switch is **not** promised.

This note records the conflict with the original accepted decision. It is
**not** the dedicated ADR-0007 amendment. Follow-up: write that amendment
when the Edge Function migration is implemented (see
`docs/architecture/overview.md`). Until then, do not copy the original
no-change portability wording into new work.

## Context

Local development must be reproducible without cloud accounts. The original
bootstrap portability promise (managed Supabase, self-hosted Supabase, or
vanilla Postgres plus replacement auth/storage as equivalents) is superseded
as a deployment promise.

## Decision

- The **Supabase CLI** (pinned devDependency) is canonical for local
  Postgres/Auth/Storage. It is never exposed publicly.
- All migrations are **ordinary PostgreSQL SQL** files — no Supabase-specific
  migration features.
- Provider-specific code originally lived only in adapters in `apps/api`.
  **That adapter location is superseded.** Target coupling is Edge Functions
  plus database functions; a dedicated amendment will describe the remaining
  portability surface when the migration exists.
- Domain/combat packages import no provider code at all (CI-enforced). This
  part remains valid.

## Consequences

- `supabase db reset` gives a byte-fresh database on every developer machine.
- Portability drills (export/restore) are documented in runbooks before any
  production deployment.
- Self-hosting transfers operational burden; that trade-off is accepted only
  after the load/backup runbooks exist.
- Switching away from Supabase Edge Functions / database functions is an
  adaptation project, not a configuration swap.
