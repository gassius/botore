# ADR-0001: Cocos Creator over Godot

Status: accepted (bootstrap) · Date: 2026-08-24 · Pinned release: 3.8.x (record exact build when the editor project is first created)

## Context

The game client must be mobile-first, scriptable in TypeScript, and friendly to
AI coding agents working alongside a React/Node team. Two engines were
evaluated per `game-architecture-report.md` §3.

## Decision

Use **Cocos Creator 3.x** with TypeScript as the primary scripting language,
conditional on the Phase-0 vertical slice. Godot 4.x remains the documented
fallback.

## Rationale

- TypeScript is first-class in Cocos; Godot requires GDScript/C#, splitting
  agent and team context.
- Shared pure packages (`replay`, `combat-engine`) can be consumed by the
  client without a language boundary.
- Mobile + web + mini-game export targets from one project.
- Engine source is MIT; no runtime royalty identified for ordinary
  distribution. Editor terms are reviewed per pinned release before commercial
  release (see licensing notes in the architecture report).

## Consequences

- The editor is required for scenes/native builds; editor-generated metadata
  is committed deliberately, isolated from gameplay code changes.
- Agents modify only `assets/scripts/**`; scene files change via explicit,
  separate commits.
- Exit criteria: if the two-week proof fails on determinism, package
  consumption, or native build reproducibility, re-open this ADR and evaluate
  Godot.

## License/third-party notice locations (fill on pinning)

- Engine repo: https://github.com/cocos/cocos-engine (LICENSE at repo root)
- Creator terms: shipped inside the editor install; archive the copy for the
  pinned version under `docs/licenses/`.
