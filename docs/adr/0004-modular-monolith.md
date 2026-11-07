# ADR-0004: Modular monolith first

Status: accepted (deployment shape partially superseded) · Date: 2026-08-24

**Supersession (7 November 2026 kickoff; documented 8 November 2026):** the
**one API process and one worker process** deployment (`apps/api` +
`apps/worker`, Fastify) is superseded. Server-side work is cohesive Supabase
Edge Functions plus shared domain modules. Async work, if needed, uses
pg_cron plus an Edge Function or an approved Postgres/Supabase-hosted queue
— not a Fastify worker. Do not extend the leftover processes.

The **modular monolith** decision remains valid: cohesive in-repo modules, no
premature microservices, no Redis/Kubernetes until measurements demand them.
See `game-architecture-report.md` §2 and §7, and the notice on ADR-0006.

## Context

The platform must ship a vertical slice quickly while keeping future service
extraction possible. Premature microservices were rejected in the architecture
report §2.6.

## Decision

Originally: deploy **one API process** and **one worker process** as separate
entrypoints of one codebase, with module boundaries inside `apps/api/src`
(identity, roster, arena, simulation, progression, analytics) enforced by
import rules, not network hops.

**Still in force:** keep those concerns as cohesive modules in one codebase;
do not extract microservices. Module boundaries are import rules and shared
packages, not network hops.

**Superseded:** the Fastify two-process deployment. Target entrypoints are
Edge Functions and, where persistence must be atomic, Postgres database
functions.

## Consequences

- Single transaction spans arena + progression + outbox — exactly what the
  idempotency guarantees need. That transaction lives in a database function,
  not across separate HTTP requests holding `BEGIN`.
- Extraction later means replacing an in-process function call with an HTTP/
  queue call; no data model rewrite.
- Redis/Kubernetes are explicitly out of scope until measurements demand them
  (report §14).
