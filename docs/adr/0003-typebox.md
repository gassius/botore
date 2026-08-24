# ADR-0003: TypeBox as the schema library

Status: accepted · Date: 2026-08-24

## Context

Contracts need runtime validation plus static types plus OpenAPI output.
Primary candidates: TypeBox, Zod.

## Decision

Use **@sinclair/typebox** consistently across contracts, analytics-events, and
config packages.

## Rationale

- JSON-Schema-native: OpenAPI documents derive directly from the same schemas
  used for runtime checks — one source of truth.
- `Static<typeof schema>` gives precise TS types without codegen steps.
- Value.Check is fast and dependency-light compared to alternatives with
  richer error UX we do not need yet.

## Consequences

- Validation error shaping is ours to standardize (see
  ReplayValidationError / AnalyticsValidationError patterns).
- If richer error messages become product requirements, wrap Value errors
  rather than replacing the library.
- Zod must NOT appear in any workspace dependency.
