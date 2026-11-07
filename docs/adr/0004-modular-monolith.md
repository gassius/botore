# ADR-0004: Modular monolith first

Status: accepted · Date: 2026-08-24

## Context

The platform must ship a vertical slice quickly while keeping future service
extraction possible. Premature microservices were rejected in the architecture
report §2.6.

## Decision

Deploy **one API process** and **one worker process** as separate entrypoints
of one codebase. Module boundaries live inside `apps/api/src` (identity,
roster, arena, simulation, progression, analytics) enforced by import rules,
not network hops.

## Consequences

- Single transaction spans arena + progression + outbox — exactly what the
  idempotency guarantees need.
- Extraction later means replacing an in-process function call with an HTTP/
  queue call; no data model rewrite.
- Redis/Kubernetes are explicitly out of scope until measurements demand them
  (report §14).
