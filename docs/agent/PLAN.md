# Implementation Plan — Bootstrap (2026-08-24)

Scope: repository foundation + narrow vertical slice per tasking. No product mechanics
beyond the slice. Every requirement is either implemented or has a documented,
verified blocker.

## Plan (change groups = commit boundaries)

1. **Root**: git init, `.gitignore`, `package.json` (engines pinned Node 24 LTS),
   pnpm workspace, Turborepo, shared tsconfig/eslint/prettier packages, license
   inventory script.
2. **Pure packages** (`packages/rng|domain|replay|combat-engine|contracts|
   analytics-events|config|test-fixtures`): zero runtime deps except contracts'
   TypeBox; no Node/browser APIs; seeded PRNG interface with versioned algorithms;
   deterministic combat v1 emitting semantic events; golden + fast-check property
   tests.
3. **Apps**: Fastify API (vertical slice endpoints, idempotent transactional battle
   flow), worker (health + outbox drain stub), Next.js dashboard (server-side reads,
   dev-only auth shortcut that fails closed outside development), Cocos Creator
   scaffold (editor-ready boundary, adapter source, manual import steps).
4. **Database**: Supabase project (pinned CLI as devDependency), ordinary SQL
   migrations, seed data, RLS, pgTAP-style plain-SQL tests runnable via `psql`,
   append-only ledgers, analytics outbox, admin audit log.
5. **Docs**: README, AGENTS.md, ADRs (Cocos/Godot, Fastify, TypeBox, modular
   monolith, replay storage, Supabase portability), architecture overview +
   Mermaid diagrams, runbooks, SECURITY/CONTRIBUTING/third-party notices.
6. **CI/compose**: GitHub Actions least-privilege workflows; Docker Compose for
   API/worker only (Supabase CLI remains canonical for Postgres/Auth locally);
   architecture-boundary checker script; secret scan.
7. **Verification**: `pnpm verify`; live local Supabase reset + integration path.

## Key risks

| Risk | Mitigation |
|---|---|
| Supabase CLI needs Docker + first-run image pull (slow/net-dependent) | Start `supabase start` early in background; document exact failure modes |
| Cross-runtime determinism drift | Integer math only in engine, injected PRNG, golden fixtures, property tests |
| pnpm/Cocos interplay (Creator can't resolve workspace imports) | Game app consumes compiled ESM artifacts via relative paths; documented sync script |
| Idempotency bugs double-awarding XP | Unique constraint on (command, key) + single transaction + DB test |
| RLS gaps let clients write protected tables | Deny-by-default policies + explicit DB tests |
| Scope creep into product mechanics | Vertical-slice checklist is the contract; anything else rejected |

## Environment findings (2026-08-24)

- Node v24.18.0, pnpm 11.7.0, Docker 29.1.3 (daemon up), git 2.43.
- No Cocos Creator installed → editor-free scaffold + verified manual steps.
- No global supabase binary → pinned CLI devDependency, invoked via pnpm exec.
