# ADR-0006: Fastify for API and worker health

Status: **superseded** · Date: 2026-08-24

**Superseded by:** final 7 November 2026 kickoff server decision (documented
8 November 2026). Server-authoritative fight computation runs in **Supabase
Edge Functions** using combat-v1. Persistence is PostgreSQL (database
functions for the atomic fight transaction). The analytics outbox drains on
**pg_cron**. Media is `atlas/vN/` in Supabase Storage.

Do not add Fastify routes, a Fastify outbox worker, or new Fastify surface.
Leftover `apps/api` and `apps/worker` are bootstrap-era remnants, not current
dependencies to extend.

TypeBox + OpenAPI contracts from ADR-0003 remain. See
`docs/architecture/overview.md` and the ADR-0004 deployment-shape notice.

## Context

The gameplay API needs schema-driven validation, low ceremony, and strong
TypeScript ergonomics. NestJS was considered and rejected as heavy for a
modular monolith.

## Decision (historical)

Use **Fastify 5.x** for the HTTP surface of `apps/api` and the health
endpoints of `apps/worker`. Validation uses TypeBox schemas from
`@botore/contracts`; OpenAPI is generated from those same schemas.

## Consequences (historical, except TypeBox)

- No decorators/DI container; plain functions with explicit dependencies.
- Route handlers stay thin: validate → call module function → shape response.
- Fastify plugins are added per need; nothing speculative in the bootstrap.
- **Current:** those Fastify consequences no longer apply. Do not use this
  ADR as permission to grow Fastify.
