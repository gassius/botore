# Game Architecture Report

**Status:** Starting architecture for implementation  
**Date:** 24 August 2026  
**Audience:** Product owner, technical lead, and AI coding agents

## 1. Executive decision

Build the product as a **TypeScript-first monorepo** whose center is a framework-neutral, deterministic combat simulation package. Use **Cocos Creator** for the Android/iOS game client, **Node.js with TypeScript** for server-authoritative gameplay services, **PostgreSQL through Supabase** for data/auth/storage, and **React/Next.js** for the operations and analytics dashboard.

The system must run locally from a clean clone. Supabase CLI supplies the local Postgres/Auth/Storage stack; Docker Compose supplies application services and optional dependencies. Production may use managed Supabase or a self-hosted Postgres/Supabase-compatible deployment without changing domain code.

### Recommended stack

| Layer | Decision | Rationale |
|---|---|---|
| Game client | Cocos Creator 3.x + TypeScript | Mobile-first exports, official TypeScript workflow, 2D/3D tooling |
| Alternative engine | Godot 4.x | Strong open-source fallback if editor/tooling or Cocos constraints become unacceptable |
| Monorepo | pnpm workspaces + Turborepo | Familiar TypeScript tooling, task caching, clear package boundaries |
| API | Node.js LTS + TypeScript + Fastify | Lean, fast, schema-driven HTTP service; fewer framework conventions than NestJS |
| Contracts | TypeBox or Zod + OpenAPI | Runtime validation and generated/documented interfaces |
| Database/platform | PostgreSQL + Supabase | SQL source of truth, Auth, Storage, local CLI workflow |
| Jobs | PostgreSQL-backed queue initially | Avoid Redis until workload proves it necessary |
| Dashboard | Next.js + React + TypeScript | Reuses existing expertise and shared contracts |
| Analytics | Typed first-party event pipeline; PostHog initially | Product analytics now; warehouse/ClickHouse later |
| Local stack | Supabase CLI + Docker Compose | Reproducible, provider-neutral development |
| CI | GitHub Actions | Lint, types, unit/integration tests, migrations, builds |

This is a starting decision, not an irreversible commitment. Run a short Cocos proof-of-concept before full production.

## 2. Architectural principles

1. **Server authority:** the server validates fight eligibility, selects the seed, runs the canonical simulation, persists the outcome, and awards progression.
2. **Determinism:** identical rules version, input snapshot, and seed produce an identical event stream and final state.
3. **Renderer separation:** combat rules emit semantic events; the Cocos client turns events into animation. Animation never decides gameplay.
4. **Portable core:** domain packages cannot import Cocos, Fastify, Supabase SDKs, browser APIs, clocks, or unseeded randomness.
5. **Local parity:** schema, migrations, seeds, service configuration, and test fixtures live in Git.
6. **Modular monolith first:** deploy one gameplay API and one worker before splitting services.
7. **Observable by design:** every important product and economy transition has a versioned, consent-aware event.
8. **Agent-safe changes:** bounded packages, explicit contracts, architecture tests, small tasks, and executable acceptance criteria.

## 3. Cocos Creator versus Godot

| Criterion | Cocos Creator | Godot |
|---|---|---|
| Primary scripting | TypeScript/JavaScript is first-class | GDScript first-class; C# also supported; TypeScript is not a standard first-class path |
| Fit with React/Node skills | High | Medium-low |
| VSCode/Cursor workflow | Strong for scripts and shared TS packages | External editors work, but engine language/tooling differs |
| Visual authoring | Cocos Creator editor required for scenes, assets, animation, native builds | Godot editor required for scenes, resources, animation, export |
| Mobile/web targets | Android, iOS, web, desktop and mini-game targets | Android, iOS, web and desktop |
| 2D suitability | Strong and mobile-oriented | Strong, mature general-purpose 2D workflow |
| Ecosystem | Commercially proven; less Western learning material | Larger Western indie community and tutorial ecosystem |
| AI-agent friendliness here | Higher because gameplay/application code is TypeScript | Lower because agents must cross TS and GDScript/C# boundaries |
| Engine license | Runtime engine repository uses MIT; Creator/editor terms must also be reviewed for the selected release | MIT |
| Engine royalties/runtime fees | No engine royalty/runtime fee identified for ordinary game distribution | None |
| Main risk | Smaller local talent/tutorial pool; Creator tooling and editor terms need release-by-release review | Language/context switch and weaker TypeScript reuse |

### Licensing conclusion

Godot is the clearest case: its official license page states that the engine is MIT-licensed, games remain the developer's property, commercial distribution is permitted, and the engine copyright/license notice must accompany distributed engine code.

Cocos publishes its engine source under MIT and describes Creator as free and open source. However, the engine repository also contains separate Creator/editor terms. Therefore:

- no revenue royalty or runtime fee is expected for shipping a game with the standard engine;
- preserve all required copyright and third-party notices;
- do not assume the MIT engine license grants a right to redistribute a modified Creator authoring tool;
- pin a specific Creator version and archive its engine license, editor terms, and third-party notices before commercial release;
- obtain legal review before redistributing editor modifications or embedding non-standard SDKs.

This report is technical guidance, not legal advice. App Store/Google Play fees, advertising SDK terms, asset licenses, fonts, audio, and third-party plugins are separate obligations.

### Recommendation and exit criteria

Choose **Cocos Creator**, conditional on a two-week vertical slice proving:

- one deterministic replay renders identically on Android, iOS simulator/device, and web preview;
- shared workspace packages can be consumed without copying generated files;
- headless/unit testing covers the simulation outside Creator;
- native builds and signing steps can be documented and repeated;
- Creator editor metadata behaves cleanly in Git;
- a coding agent can modify gameplay code without rewriting scene files.

Switch to Godot only if the proof exposes a blocking Cocos limitation that outweighs the TypeScript advantage.

## 4. System context and containers

The mobile client authenticates, manages characters, selects an opponent, requests a fight, then receives a canonical replay. The API owns all mutations. An asynchronous worker can simulate or post-process battles. The dashboard reads operational projections and analytics; it does not write gameplay tables directly.

The downloadable diagram shows the container relationships. Its editable SVG is the source of truth.

## 5. Monorepo structure

```text
/
├── apps/
│   ├── game/                 # Cocos Creator project; thin adapters and presentation
│   ├── api/                  # Fastify HTTP API
│   ├── worker/               # battle/job processor
│   └── dashboard/            # Next.js operations and analytics UI
├── packages/
│   ├── combat-engine/        # pure deterministic simulation
│   ├── domain/               # entities, policies, progression, matchmaking
│   ├── contracts/            # API DTOs, event schemas, generated OpenAPI types
│   ├── rng/                  # explicit seeded PRNG abstraction and test vectors
│   ├── replay/               # versioned replay schema and validators
│   ├── analytics-events/     # typed taxonomy and validation
│   ├── config/               # environment parsing; no secrets committed
│   ├── test-fixtures/        # builders, seeds, golden battle fixtures
│   ├── eslint-config/
│   └── tsconfig/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   ├── tests/
│   └── config.toml
├── infra/
│   ├── compose.yaml          # API, worker, analytics; Supabase CLI remains canonical locally
│   └── observability/
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── runbooks/
│   └── agent/
├── .github/workflows/
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

Do not put React in the game client. Cocos owns runtime presentation; React owns the dashboard. Both consume contracts and pure domain packages.

## 6. Deterministic combat and replay

### Canonical request flow

1. Client asks for eligible opponents.
2. Server returns a short list based on level band, hidden rating/build power, freshness, and anti-farming rules.
3. Player selects an opponent and submits a fight command with an idempotency key.
4. Server locks/consumes one active fight allowance.
5. Server snapshots both immutable combat builds, assigns a cryptographically unpredictable seed, and records the rules version.
6. `combat-engine` runs using integer/fixed-point arithmetic where practical and the injected PRNG only.
7. Engine returns final state plus ordered semantic events.
8. Transaction stores battle, participants, replay payload/hash, rewards, and analytics outbox entry.
9. Client downloads and renders the replay. Defensive participation costs the defender nothing and does not alter core progression.

### Replay envelope

```ts
interface BattleReplay {
  replayVersion: number;
  rulesVersion: string;
  battleId: string;
  seed: string;
  inputHash: string;
  fighters: readonly FighterSnapshot[];
  events: readonly BattleEvent[];
  outcome: BattleOutcome;
  checksum: string;
}
```

Store the event stream for auditability and durable playback. A seed alone is insufficient after rules or PRNG implementations change. Keep old replay renderers or provide a migration/transcoding policy.

### Determinism rules

- Never use `Math.random()`, wall-clock time, locale-sensitive sorting, or unordered object iteration in the engine.
- Inject PRNG and logical clock interfaces.
- Pin algorithm and rules versions.
- Prefer integers/fixed point across JavaScript and native targets.
- Maintain golden fixtures: known input + seed → event hash + outcome.
- Run property tests for termination, HP bounds, event validity, and identical repeat execution.
- Add a hard maximum action count and explicit draw resolution.

## 7. Backend design

Start with a modular monolith:

- **Identity/profile:** maps Supabase Auth identity to account profile.
- **Roster:** character ownership, appearance, build snapshots, slots.
- **Arena:** fight allowance, opponent candidates, challenges, battle history.
- **Simulation:** canonical combat execution and replay creation.
- **Progression:** XP, levels, unlocks, rewards and economy ledger.
- **Tournaments:** defer until the core arena is proven.
- **Analytics ingestion:** validates typed events and writes an outbox.
- **Administration:** protected commands with audit records.

Use Supabase Auth for identity verification, but terminate gameplay commands at the API. Do not allow the mobile client to update progression, inventory, rewards, energy, or battle results directly through PostgREST. Row-level security remains defense in depth for client-readable data.

Use PostgreSQL transactions and unique constraints for idempotency. Add Redis only when measurements justify distributed locks, very high-rate queues, or low-latency cache needs.

### Initial data model

- `accounts`, `profiles`, `devices`, `consents`
- `characters`, `character_build_versions`, `character_cosmetics`
- `fight_allowances`, `opponent_impressions`
- `battles`, `battle_participants`, `battle_replays`
- `progression_ledger`, `inventory_ledger`, `wallet_ledger`
- `analytics_outbox`, `admin_audit_log`
- later: `tournaments`, `tournament_entries`, `guilds`, `guild_members`

Use append-only ledgers for scarce currency and progression awards. Materialized balances may be cached but must be reconstructable.

## 8. Local reproducibility and portability

The standard developer journey should be:

```text
corepack enable
pnpm install --frozen-lockfile
pnpm env:up
pnpm db:reset
pnpm dev
pnpm verify
```

`env:up` starts the Supabase CLI local stack and application dependencies. The CLI stack is for development only; it must not be exposed publicly. Production choices are:

1. managed Supabase;
2. self-hosted Supabase using its supported Docker deployment;
3. plain managed/self-hosted PostgreSQL plus replacement auth/object storage adapters.

Provider-specific APIs remain behind ports in `apps/api`; migrations use ordinary PostgreSQL where possible. Export and restore drills should be documented and tested. Supabase self-hosting transfers backups, upgrades, security, monitoring, and availability to the team—portability is possible, not free.

## 9. Analytics and monetization readiness

### Event pipeline

Client and server events use a shared schema, but the server is authoritative for economy and battle outcomes. Each event includes:

- `event_id`, `event_name`, `schema_version`, `occurred_at`;
- anonymous/account/session/device identifiers as consent permits;
- app/build/platform/locale/acquisition context;
- battle/rules/experiment identifiers where relevant;
- privacy classification and source (`client` or `server`).

Start with PostHog for funnels, cohorts, feature flags, experiments, and retention. Send a controlled event subset; avoid sensitive replay payloads and free text. Keep a first-party event outbox/export so the warehouse destination can change. Add ClickHouse only when volume, query latency, or cost requires it.

### Core metrics

| Area | Metrics |
|---|---|
| Acquisition | installs, source/campaign, store conversion, CAC when paid acquisition begins |
| Activation | tutorial completion, first character, first fight, first replay watched, time to value |
| Engagement | DAU/WAU/MAU, sessions, fights per active, allowance utilization, replay completion |
| Retention | D1/D7/D30 and rolling retention by cohort/source/platform/build |
| Match quality | expected-vs-actual win rate, candidate selection rate, upset rate, opponent diversity, rematches |
| Progression | XP velocity, level time, unlock distribution, roster/slot use, churn by progression state |
| Reliability | crash-free users/sessions, ANR, API latency/error rate, simulation failures, replay checksum failures |
| Economy | sources/sinks, balances, inflation, purchase conversion, payer rate, ARPDAU, ARPPU, LTV |
| Advertising | impressions, fill, eCPM, opt-in rate, reward completion, revenue per DAU |
| Fairness/abuse | suspicious fights, farming pairs, duplicate commands, impossible event sequences |

Integrate App Store Connect and Google Play Console reporting for store funnel, crashes/ANRs, subscriptions, refunds, and revenue reconciliation. Treat those as external reporting sources, not replacements for first-party gameplay telemetry.

### Privacy

Implement consent and deletion flows before advertising attribution SDKs. Minimize collection, separate operational and analytical retention, pseudonymize identifiers, honor regional consent requirements, and never place secrets or raw authentication tokens in analytics.

## 10. Security and anti-cheat

- Server creates seeds and signs/identifies canonical replays.
- Client cannot submit winners, damage, XP, rewards, or inventory mutations.
- Rate-limit by account/device/network signals with privacy review.
- Use idempotency keys and database constraints on all reward-bearing commands.
- Snapshot combat inputs and record hashes for investigation.
- Keep secrets in environment/secret managers, never game bundles.
- Audit administrative changes and economy grants.
- Validate all API and analytics payloads at runtime.
- Add dependency, secret, and container scanning to CI.

## 11. Testing and CI

### Test pyramid

- Unit: domain policies, PRNG, combat rules, progression calculations.
- Golden deterministic tests: fixed inputs/seeds and replay hashes.
- Property tests: invariants and termination.
- Contract tests: OpenAPI/request-response compatibility.
- Database tests: migrations, RLS, ledger/idempotency rules.
- Integration: API + local Supabase/Postgres.
- Game smoke tests: load scene, request fixture replay, render to completion.
- Dashboard tests: critical admin/read-only flows.
- E2E: account → character → candidate → fight → replay → reward.

CI must run formatting, linting, type checking, unit/property tests, database reset/migration tests, integration tests, production web/API/dashboard builds, license inventory, and architecture-boundary checks. Native Cocos builds can begin as scheduled/manual jobs because signing runners are heavier; make them required before release.

## 12. Agentic-coder readiness

Include an `AGENTS.md` that defines package boundaries, commands, prohibited dependencies, file ownership, testing obligations, and safe database practices. Each coding task should name:

- intended outcome and non-goals;
- permitted packages/directories;
- contracts and invariants;
- acceptance tests and exact verification command;
- whether migrations or public APIs may change.

Keep generated files labeled, keep Cocos scene/metadata changes isolated, and require agents to report changed files and test evidence. Architecture decision records should capture consequential choices rather than leaving rationale in chat history.

## 13. Delivery phases

### Phase 0 — feasibility (two weeks)

Bootstrap repository; validate Cocos package consumption, one scene, one headless deterministic battle, Android/iOS/web replay, local Supabase, API round trip, and CI.

### Phase 1 — playable vertical slice

Authentication, one character, candidate list, daily fight allowance, server battle, replay rendering, progression ledger, minimal dashboard, and activation/retention events.

### Phase 2 — closed alpha

Roster slots, build variation, battle history, abuse controls, balancing tools, remote config/experiments, crash reporting, privacy workflows.

### Phase 3 — live readiness

Load tests, backup/restore drill, store pipelines, alerts/runbooks, economy audit, monetization hooks (disabled by default), legal/license review.

## 14. Decisions deliberately deferred

- exact cloud provider and production topology;
- Redis and dedicated analytical warehouse;
- microservices, Kubernetes, and multi-region writes;
- ads/IAP vendor selection;
- tournament/guild implementation;
- asset-generation production pipeline.

Deferring these keeps the first system inexpensive and comprehensible without closing migration paths.

## 15. Principal risks

| Risk | Mitigation |
|---|---|
| Cocos/editor automation friction | Time-boxed proof, pin version, document native build steps |
| Cross-runtime nondeterminism | Integer math, explicit PRNG, golden cross-target fixtures |
| Shared package incompatibility in Creator | Thin adapter, compiled ESM artifacts, feasibility gate |
| Supabase-specific coupling | Ports/adapters, SQL migrations, export/restore tests |
| Analytics sprawl/privacy | Typed allowlist, schema review, consent and retention policy |
| Premature platform complexity | Modular monolith, Postgres queue, measurement-based extraction |
| AI-generated architectural drift | AGENTS.md, dependency rules, ADRs, CI boundary tests |

## 16. Sources and verification notes

- [Cocos Creator product page](https://www.cocos.com/en/creator) — official TypeScript, open-source and cross-platform positioning.
- [Cocos engine repository](https://github.com/cocos/cocos-engine) — engine source and release-specific license files.
- [Cocos Creator TypeScript manual](https://docs.cocos.com/creator/1.10/manual/en/scripting/typescript.html) — official TypeScript and VSCode workflow (older manual; validate against the pinned 3.x release).
- [Godot license](https://godotengine.org/license/) — MIT terms, ownership, distribution and attribution.
- [Supabase local development](https://supabase.com/docs/guides/local-development) and [CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows) — reproducible local stack, migrations and seeds.
- [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting) — production self-hosting model and operational responsibilities.

All vendor capabilities and terms should be rechecked when versions are pinned and before release.
