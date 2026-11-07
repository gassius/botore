# ADR-0006: Fastify for API and worker health

Status: accepted · Date: 2026-08-24

## Context

The gameplay API needs schema-driven validation, low ceremony, and strong
TypeScript ergonomics. NestJS was considered and rejected as heavy for a
modular monolith.

## Decision

Use **Fastify 5.x** for the HTTP surface of `apps/api` and the health
endpoints of `apps/worker`. Validation uses TypeBox schemas from
`@botore/contracts`; OpenAPI is generated from those same schemas.

## Consequences

- No decorators/DI container; plain functions with explicit dependencies.
- Route handlers stay thin: validate → call module function → shape response.
- Fastify plugins are added per need; nothing speculative in the bootstrap.
