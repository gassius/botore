# ADR-0007: Supabase locally, PostgreSQL everywhere, adapters at the edge

Status: accepted · Date: 2026-08-24

## Context

Local development must be reproducible without cloud accounts. Production may
be managed Supabase, self-hosted Supabase, or vanilla Postgres + replacement
auth/storage (report §8).

## Decision

- The **Supabase CLI** (pinned devDependency) is canonical for local
  Postgres/Auth/Storage. It is never exposed publicly.
- All migrations are **ordinary PostgreSQL SQL** files — no Supabase-specific
  migration features.
- Provider-specific code lives only in adapters:
  - Auth verification → behind an interface in apps/api (identity module).
  - Storage/analytics sinks → interface implementations (`AnalyticsSink`).
- Domain/combat packages import no provider code at all (CI-enforced).

## Consequences

- `supabase db reset` gives a byte-fresh database on every developer machine.
- Portability drills (export/restore) are documented in runbooks before any
  production deployment.
- Self-hosting transfers operational burden; that trade-off is accepted only
  after the load/backup runbooks exist.
