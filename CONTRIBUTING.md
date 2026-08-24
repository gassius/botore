# Contributing

## Setup

See README.md for the full local stack. Minimum: Node 24 (pinned in
`package.json` engines), pnpm 11, Docker-compatible runtime.

## Workflow

1. Small, focused change groups; one logical concern per commit.
2. Conventional commit subjects (`feat:`, `fix:`, `docs:`, `chore:`,
   `refactor:`, `test:`, `ci:`).
3. Run `pnpm verify` before pushing. DB-touching changes also require
   `pnpm env:up && pnpm db:reset && pnpm test:integration`.
4. New tables need RLS policies + tests in `supabase/tests/run.sql`.
5. Changes to pure packages must keep `scripts/check-boundaries.mjs` green.
6. Combat formula changes require a new `rulesVersion` + ADR + regenerated
   golden fixtures — see docs/architecture/combat-v1.md.

## Code style

- TypeScript strict everywhere; no `any` (ESLint enforced).
- Prettier formatting is checked in CI; run `pnpm format`.
- Tests colocated per package under `test/`; integration tests under
  `apps/api/test/integration/`.

## Third-party notices

When adding a runtime dependency: run `bash scripts/license-inventory.sh`;
only MIT/ISC/Apache-2.0/BSD/0BSD-class licenses pass without review. Record
notable third-party assets and their licenses in `THIRD-PARTY-NOTICES.md`
(create it when the first external asset ships).
