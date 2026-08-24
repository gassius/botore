# ADR-0005: Deterministic replay storage

Status: accepted · Date: 2026-08-24

## Context

Battles must be auditable and re-renderable years later. Seed-only replay is
insufficient: any change to rules, PRNG implementation, or event semantics
silently invalidates replays.

## Decision

Store the **full semantic event stream** plus:

- `replayVersion` (envelope shape version),
- `rulesVersion` ("combat-v1"; bumped on any formula change),
- `seed` (CSPRNG hex from server),
- `inputHash` (canonical JSON of fighter snapshots),
- `checksum` (canonical JSON hash of everything above).

Replays persist as JSONB in `battle_replays`; the checksum is verified on
read paths that matter (dashboard integrity column today; full verify in the
replay service later).

## Consequences

- Old replays stay renderable by shipping per-version render adapters in the
  client (the Cocos adapter switches on `rulesVersion`).
- Regenerating events from seed+inputs is possible but never required.
- Tampering is detectable: any payload edit breaks `verifyReplay`.
- Changing combat formulas requires a NEW rulesVersion string and new golden
  fixtures; existing rows are immutable history.
