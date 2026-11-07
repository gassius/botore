# Game Architecture Report

**Status:** Current product/architecture plan — aligned with final 7 November 2026 decisions; implementation and phone validation remain to be demonstrated.  
**Date:** 24 August 2026 (original)  
**Revised:** 8 November 2026  
**Audience:** Product owner, technical lead, and AI coding agents

This document is the selected product/architecture plan. It is not a claim that the target stack, customisation path, or phone performance has already shipped or been proven. Bootstrap-era Fastify, Cocos, and Docker Compose application-service wording elsewhere in the repository is historical unless a later ADR or this report says otherwise.

## 1. Executive decision

Build Botore as a phone-first robot auto-battler in a TypeScript-first monorepo. Expo / React Native is the iOS and Android client; web export is a preview, not a separate product. Deterministic combat remains a framework-neutral pure package. Server-authoritative fight computation runs in Supabase Edge Functions using combat-v1. PostgreSQL supplies transactional persistence, and Supabase supplies Auth and versioned media Storage. React/Next.js remains the operations dashboard. Fastify and Cocos Creator are superseded choices, not current dependencies to extend.

Preserve reproducible local development with Supabase CLI and documented local function/testing commands. This is a selected plan, not a promise that every runtime, customisation or performance requirement has already been proven.

### Recommended stack

| Layer             | Decision                                                              | Rationale                                                                                          |
| ----------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Game client       | Expo / React Native (iOS and Android)                                 | Phone-first, code-editable, agent-friendly; web export is preview only                             |
| Renderer          | Animated initially; measured escalation to Skia if agreed limits fail | Do not rewrite the renderer from a browser preview, average FPS, or an audio fault                 |
| Monorepo          | pnpm workspaces + Turborepo                                           | Familiar TypeScript tooling, task caching, clear package boundaries                                |
| Server            | Supabase Edge Functions using combat-v1                               | Server-authoritative fight computation; Fastify is superseded                                      |
| Contracts         | TypeBox + OpenAPI (ADR-0003)                                          | Runtime validation and generated/documented interfaces; TypeBox is already chosen, not TypeBox/Zod |
| Database/platform | PostgreSQL + Supabase Auth + versioned media Storage                  | SQL source of truth, identity, and on-demand packs                                                 |
| Jobs              | Postgres-backed / Supabase-hosted work as needed                      | No Fastify worker; no Redis/Kubernetes/message-broker expansion                                    |
| Dashboard         | Next.js + React + TypeScript                                          | Operations UI; read-only reporting credential                                                      |
| Analytics         | First-party typed, consent-aware events; PostHog/warehouse later      | Later needs, never a cloud-account prerequisite for local development                              |
| Local stack       | Supabase CLI (local Postgres/Auth/Storage)                            | Reproducible clone-to-run; no mandatory Docker Compose application-service dependency              |
| CI                | GitHub Actions                                                        | Lint, types, unit/integration tests, migrations, builds                                            |

Do not introduce new services. Do not treat leftover `apps/api` / `apps/worker` as the target to extend.

## 2. Architectural principles

1. **Server authority:** the server validates fight eligibility, selects the seed, runs the canonical simulation, persists the outcome, and awards progression. The client requests canonical fights and plays returned semantic events; it never chooses outcomes.
2. **Determinism:** identical rules version, input snapshot, and seed produce an identical event stream and final state.
3. **Renderer separation:** combat rules emit semantic events; the Expo / React Native client turns events into animation. Animation never decides gameplay.
4. **Portable core:** pure combat/domain packages remain free of React Native, Supabase SDKs, framework imports, clocks, IO and unseeded randomness.
5. **Local parity:** schema, migrations, seeds, service configuration, and test fixtures live in Git. Local Supabase CLI remains the development path.
6. **Cohesive server-side modules:** deploy cohesive Edge Functions and shared domain modules; no microservices expansion. The earlier “one gameplay API and one worker” process split is superseded (see ADR-0004 notice).
7. **Observable by design:** every important product and economy transition has a versioned, consent-aware event.
8. **Agent-safe changes:** bounded packages, explicit contracts, architecture tests, small tasks, and executable acceptance criteria.

## 3. Client rendering proof

The previous Cocos Creator versus Godot comparison and Cocos licensing/exit decision are historical research, not current engine approval. Expo is already selected (ADR-0001). ADR-0001’s assertion of renderer sufficiency is historical rationale, not measured proof of the new modular kit.

Expo / React Native is selected for a code-editable, agent-friendly workflow. Start with Animated and a representative modular kit and stored replay. Measure a release build on an identified Android phone, including loading, frame-time spikes and dropped frames; agree limits before measuring. A browser preview or average FPS alone does not establish native suitability. Compare Skia only if the measured build fails agreed requirements. An audio fault is not automatic evidence for a renderer rewrite. PNG parts and masks are the starting candidate, not a proven performance result, and no universal SVG performance claim is made.

There is no rigid two-week feasibility gate.

### Provenance and license checks (not engine selection)

Pin third-party versions and archive engine/runtime licenses, editor or SDK terms, and third-party notices before commercial release. Preserve required copyright notices. App Store/Google Play fees, advertising SDK terms, asset licenses, fonts, audio, and third-party plugins are separate obligations. This report is technical guidance, not legal advice. Historical Cocos/Godot license notes remain in §16 as research references only.

## 4. System context and containers

The mobile client authenticates, manages bots/loadouts, selects an opponent, requests a fight, then receives a canonical replay. The client never chooses outcomes.

Target request path: client → Supabase Edge Functions → PostgreSQL, with Supabase Auth and versioned media Storage. React/Next.js remains a read-only operations dashboard. Async processing, if needed, uses pg_cron plus an Edge Function or approved Postgres/Supabase queue, not a Fastify process.

The checked-in overview diagram in `docs/architecture/overview.md` is the current source of truth for container relationships after this alignment. It distinguishes the target Edge/database-function boundary from leftover Fastify bootstrap code. Do not treat an external downloadable SVG as current.

## 5. Monorepo structure

Conceptual tree for the **target** plan. Paths marked remnant still exist from bootstrap; they are not the architecture to extend. Proposed `supabase/functions/` entrypoints are planned, not a claim that they have shipped or that a specific runtime has already been proven compatible.

```text
/
├── apps/
│   ├── game/                 # Expo / React Native; presentation and replay playback
│   ├── api/                  # BOOTSTRAP REMNANT (Fastify); do not extend
│   ├── worker/               # BOOTSTRAP REMNANT (Fastify outbox worker); do not extend
│   └── dashboard/            # Next.js operations and analytics UI (read-only)
├── packages/
│   ├── combat-engine/        # pure deterministic simulation (combat-v1)
│   ├── domain/               # entities, policies, progression, matchmaking
│   ├── contracts/            # TypeBox DTOs, event schemas, generated OpenAPI types
│   ├── rng/                  # explicit seeded PRNG abstraction and test vectors
│   ├── replay/               # versioned replay schema and validators
│   ├── analytics-events/     # typed taxonomy and validation
│   ├── config/               # environment parsing; no secrets committed
│   ├── test-fixtures/        # builders, seeds, golden battle fixtures
│   ├── eslint-config/
│   └── tsconfig/
├── supabase/
│   ├── functions/            # planned Edge Function entrypoints (not yet shipped)
│   ├── migrations/
│   ├── seed.sql
│   ├── tests/
│   └── config.toml
├── infra/
│   ├── compose.yaml          # leftover API/worker compose; not a required app-service dependency
│   └── observability/
├── docs/
│   ├── architecture/         # overview diagram + frozen combat-v1 spec
│   ├── adr/
│   ├── runbooks/
│   └── agent/
├── .github/workflows/
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

React Native owns client presentation; combat packages remain framework-neutral. The dashboard may use React. Both consume contracts and pure domain packages.

## 6. Deterministic combat and replay

Canonical combat rules stay in `docs/architecture/combat-v1.md`. This report does not change formulas, draw order, `rulesVersion`, PRNG version, action limit, or golden fixtures.

### Canonical request flow

1. Client asks for eligible opponents.
2. Server resolver / Supabase Edge Function returns a short list based on level band, hidden rating/build power, freshness, and anti-farming rules.
3. Player selects an opponent and submits a fight command with an idempotency key.
4. Server resolver authorizes the caller and confirms fight eligibility.
5. Server snapshots both immutable combat builds (including media/build version references), assigns a cryptographically unpredictable seed, and records the rules version. The client never supplies the seed or the winner.
6. `combat-engine` runs in-process in the Edge Function using integer/fixed-point arithmetic where practical and the injected PRNG only.
7. Engine returns final state plus ordered semantic events.
8. A single atomic Postgres transaction — implemented as a database function — consumes one active fight allowance and persists outcome, replay, rewards, and analytics outbox. Idempotency is enforced here. Separate network requests must not share a long-lived database transaction. This document does not invent an RPC signature or migration; implementation must prove concurrency, failure, and retry behaviour.
9. Client downloads and renders the replay. Replay rendering duration is distinct from server simulation execution time. Defensive participation costs the defender nothing and does not alter core progression.

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

Store the event stream for auditability and durable playback. A seed alone is insufficient after rules or PRNG implementations change. Keep old replay renderers or provide a migration/transcoding policy. Immutable fight build/media references and version retention preserve historical appearance and sound (ADR-0005 remains valid; do not silently change checksums or schemas in this documentation pass).

### Determinism rules

- Never use `Math.random()`, wall-clock time, locale-sensitive sorting, or unordered object iteration in the engine.
- Inject PRNG and logical clock interfaces.
- Pin algorithm and rules versions.
- Prefer integers/fixed point across JavaScript and native targets.
- Maintain golden fixtures: known input + seed → event hash + outcome.
- Run property tests for termination, HP bounds, event validity, and identical repeat execution.
- Add a hard maximum action count and explicit draw resolution.

Benchmarks validate the chosen Edge runtime. They do not reopen the stack decision as an artificial prerequisite, and this document records no benchmark result.

### Bots, loadouts and modular media

A bot is server-validated configuration referencing shared catalogue parts, not a unique finished image. The intended model supports chassis/body parts, paint, weapons, shields, drones and decals with explicit compatibility rules. The client previews changes; the server validates ownership and slot compatibility and confirms persistence. Client code does not write loadout, catalogue, inventory, progression or reward tables directly. Failed saves preserve the last confirmed loadout and distinguish pending preview from saved state.

Stable, customisation preview and fight use identical assembly rules. Shared versioned manifests in Supabase Storage reference part PNGs, paint masks, attachment geometry and separate audio files. ‘Atlas’ can describe the overall pack system, but sound is not stored inside image pixels. Download/cache the packs needed for the stable/current fight instead of bundling the future catalogue in the app. A small base pack supplies generic UI/audio fallback; missing audio must not block the fight. Immutable fight build/media references and version retention preserve historical appearance and sound.

Game Art supplies compatible parts, pivots/grips, layer order, paint masks, decal regions, mirroring rules and assembled references. Engineering owns assembly, animation, loading, caching and performance. New compatible images may reuse existing behaviour; new weapon/drone mechanics can require code. Do not promise arbitrary combinations or assets-only mechanics.

PNG parts and masks remain an unproven customisation candidate until a representative phone build demonstrates them. New catalogue slots do not imply adding their mechanics to combat-v1 now. Unrelated fight allowance, candidate selection, progression and defender-participation requirements stay as specified above.

## 7. Backend design

Cohesive server-side modules, not a Fastify API plus worker pair and not a microservices split:

- **Identity/profile:** maps Supabase Auth identity to account profile.
- **Roster:** bot ownership, appearance/loadout, build snapshots, slots.
- **Arena:** fight allowance, opponent candidates, challenges, battle history.
- **Simulation:** canonical combat execution (Edge Function + combat-v1) and replay creation.
- **Progression:** XP, levels, unlocks, rewards and economy ledger.
- **Tournaments:** defer until the core arena is proven.
- **Analytics ingestion:** validates typed events and writes an outbox.
- **Administration:** protected commands with audit records.

Use Supabase Auth for identity verification. Terminate gameplay commands at the server resolver / Supabase Edge Function. Do not allow the mobile client to update progression, inventory, rewards, energy, loadouts, catalogue, or battle results directly through PostgREST. Row-level security remains defense in depth for client-readable data.

Use PostgreSQL transactions and unique constraints for idempotency. The Edge Function/database-function boundary must keep allowance consumption and outcome/reward/outbox persistence in one atomic Postgres transaction. Add Redis only when measurements justify it; it is not part of this plan.

### Initial data model

- `accounts`, `profiles`, `devices`, `consents`
- `characters`, `character_build_versions`, `character_cosmetics`
- `fight_allowances`, `opponent_impressions`
- `battles`, `battle_participants`, `battle_replays`
- `progression_ledger`, `inventory_ledger`, `wallet_ledger`
- `analytics_outbox`, `admin_audit_log`
- later: `tournaments`, `tournament_entries`, `guilds`, `guild_members`

Use append-only ledgers for scarce currency and progression awards. Materialized balances may be cached but must be reconstructable. Loadout/catalogue/media-version persistence is decided as a model (server-validated configuration + versioned Storage manifests); this document does not add migrations.

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

This documentation pass does not advertise those commands as re-verified here. Keep local Supabase CLI, versioned migrations, seeds, tests and documented restore drills. Document local Edge Function / testing commands as they are added. The CLI stack is for development only; it must not be exposed publicly.

Pure combat/domain code remains portable, but the selected server deployment uses Supabase Edge Functions and database functions. Other providers require runtime, auth, storage and operations adaptation; plain PostgreSQL alone is not an equivalent replacement for the entire deployment. `apps/api` is not the current adapter location. A no-change provider switch is not promised.

ADR-0007’s original accepted portability promise is in conflict with this decision. A dedicated ADR amendment is pending and is **not** completed by this report; see the supersession note on ADR-0007.

## 9. Analytics and monetization readiness

### Event pipeline

Client and server events use a shared schema, but the server is authoritative for economy and battle outcomes. Each event includes:

- `event_id`, `event_name`, `schema_version`, `occurred_at`;
- anonymous/account/session/device identifiers as consent permits;
- app/build/platform/locale/acquisition context;
- battle/rules/experiment identifiers where relevant;
- privacy classification and source (`client` or `server`).

Retain first-party typed, consent-aware analytics. PostHog, warehouse, and ClickHouse expansion are later needs, never a cloud-account prerequisite for local development. Send a controlled event subset; avoid sensitive replay payloads and free text. Keep a first-party event outbox/export so the destination can change.

Player subscriptions, ads, and shop ideas are future hypotheses, not trial implementation or tool-budget entitlements. No live payments, IAP or ads in the trial. This document does not fabricate prices or billing/renewal dates.

### Core metrics

| Area           | Metrics                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Acquisition    | installs, source/campaign, store conversion, CAC when paid acquisition begins                                                 |
| Activation     | tutorial completion, first character, first fight, first replay watched, time to value                                        |
| Engagement     | DAU/WAU/MAU, sessions, fights per active, allowance utilization, replay completion                                            |
| Retention      | D1/D7/D30 and rolling retention by cohort/source/platform/build                                                               |
| Match quality  | expected-vs-actual win rate, candidate selection rate, upset rate, opponent diversity, rematches                              |
| Progression    | XP velocity, level time, unlock distribution, roster/slot use, churn by progression state                                     |
| Reliability    | crash-free users/sessions, ANR, Edge/API latency/error rate, simulation failures, replay checksum failures                    |
| Economy        | sources/sinks, balances, inflation; purchase conversion, payer rate, ARPDAU, ARPPU, LTV are later if monetization is approved |
| Advertising    | later hypothesis only if ads are approved; not a trial entitlement                                                            |
| Fairness/abuse | suspicious fights, farming pairs, duplicate commands, impossible event sequences                                              |

Store-console reporting remains an external source, not a replacement for first-party gameplay telemetry.

### Privacy

Implement consent and deletion flows before advertising attribution SDKs. Minimize collection, separate operational and analytical retention, pseudonymize identifiers, honor regional consent requirements, and never place secrets or raw authentication tokens in analytics.

## 10. Security and anti-cheat

- Server resolver / Edge Function creates seeds and signs/identifies canonical replays.
- Client cannot submit winners, damage, XP, rewards, inventory, or loadout mutations as authority.
- Rate-limit by account/device/network signals with privacy review.
- Use idempotency keys and database constraints on all reward-bearing commands.
- Snapshot combat inputs and record hashes for investigation.
- Keep secrets in environment/secret managers, never game bundles.
- Audit administrative changes and economy grants.
- Validate Edge Function, contract, and analytics payloads at runtime.
- Add dependency, secret, and container scanning to CI.

Security blockers can be established by a demonstrably unsafe code path; successful exploitation is not required.

## 11. Testing and CI

### Test pyramid

- Unit: domain policies, PRNG, combat rules, progression calculations.
- Golden deterministic tests: fixed inputs/seeds and replay hashes.
- Property tests: invariants and termination.
- Contract tests: OpenAPI/request-response compatibility (TypeBox).
- Database tests: migrations, RLS, ledger/idempotency rules.
- Integration: Edge Functions + local Supabase/Postgres (leftover Fastify tests describe bootstrap remnants until replaced).
- Game smoke tests: load the Expo client, request a fixture replay, render to completion.
- Dashboard tests: critical admin/read-only flows.
- E2E: account → character/bot → candidate → fight → replay → reward.

CI must run formatting, linting, type checking, unit/property tests, database reset/migration tests, integration tests, production web/dashboard builds, license inventory, and architecture-boundary checks. Native Expo/Android evidence is required for integrated fight acceptance; a web build alone is not enough. Native jobs may begin as scheduled/manual because signing runners are heavier; make them required before release.

Staging-data checks gate integrated fight acceptance, not every unrelated PR.

## 12. Responsibility, review and acceptance

Engineer Supervisor owns delivery, task dispatch and cost reporting. Carlos owns product decisions, spending approval, whether the game is fun and merges. No additional PM bot. UI/UX and Art Supervisor owns the shared product visual guidelines, app screens and independent visual review. Game Art Director produces game assets/specifications within that direction. Music and Sound FX Director owns audio specification, production/provenance and audio review. Engineering owns runtime integration/performance; Supabase Infra owns database/RLS/migrations under Carlos's write-approval gate. Pull Request Reviewer owns independent code/data review.

One complete review plus one fix-verification pass. First-pass findings must be evidenced; minors and taste are non-gating. Verification checks fixes/regressions, not new preferences. A remaining genuine blocker goes to Carlos, never automatic approval or an unbounded review loop. Integrated code/data, visuals and audio are evaluated on the same representative phone replay with sound on and muted. Carlos separately judges fun: CI does not grant product acceptance.

This contract does not replace Carlos’s standing review-request workflow. Do not treat “review every PR automatically” as a new rule.

Follow current owner-held documents rather than duplicating mutable artistic or technical targets here:

- Agent guidelines: `AGENTS.md` and `docs/agent/AGENT_GUIDELINES.md` (pending kickoff encoding in https://github.com/gassius/botore/pull/6)
- [Art Direction v0.1](https://app.clickup.com/90122060531/docs/2kxv30qk-232/2kxv30qk-332) — product visual guidelines; **art style remains undecided / provisional**
- [Sound FX & Music Guidelines](https://app.clickup.com/90122060531/docs/2kxv30qk-1072) — audio specification; **audio mood remains provisional**. Do not promote that document’s provisional sync, loudness, or budget numbers into approved global requirements.

Include an `AGENTS.md` that defines package boundaries, commands, prohibited dependencies, file ownership, testing obligations, and safe database practices. Each coding task should name:

- intended outcome and non-goals;
- permitted packages/directories;
- contracts and invariants;
- acceptance tests and exact verification command;
- whether migrations or public APIs may change.

Keep generated files labeled. Require agents to report changed files and test evidence. Architecture decision records should capture consequential choices rather than leaving rationale in chat history. There is no Cocos scene-metadata requirement.

## 13. Continuous parallel delivery

No rigid day-by-day or two-week plan. Keep engineering implementation tracks and specialist art/audio work progressing concurrently against shared loadout/replay/media contracts; use placeholders until compatible assets arrive. Refill implementation capacity as PRs open. These outcomes are dependency checkpoints, not a serial calendar:

(a) A reproducible server-authoritative fight and on-phone replay; (b) integrated modular customisation with the same assembled bot in stable, preview and fight; (c) understandable integrated visuals/audio and Carlos's fun assessment; (d) catalogue/closed-alpha expansion and later release-readiness work once the proof succeeds.

Use the proposed minimal proof: one chassis, two contrasting paints, sword/axe/dagger with compatible grip, quiet arena, hit/dodge/defeat effects. Show visibly different bots, weapon swaps, paint preserving shading/metal/outlines, mirrored opponents and attached parts through motion. Keep shields/drones/decals as planned extension slots, not a promise of a full initial catalogue. Carlos's concern about whether base PNGs allow enough customisation stays open until the build demonstrates it.

Audio trial is seven SFX plus one mixed loop; adaptive stems and voices deferred. Maximum 16 draft generations, no retries; at most eight finals approved by Carlos. Check actual credit cost and obtain Carlos's explicit go before paid generation. Documentation approval is not spending approval. Mood is provisional until Carlos chooses visual style.

Record evaluation cost, useful playable output, rework/asset cleanup/integration and Carlos's supervision time; missing figures are “unknown”, not zero. PR count is not the success measure.

## 14. Decisions deliberately deferred

Decided (not entirely deferred): server choice (Supabase Edge Functions + database functions + Auth/Storage); ownership of art/audio/engineering; versioned on-demand image/audio delivery.

Still pending proof or approval:

- exact art style and visual tokens;
- kit geometry, export sizes, and cache budgets;
- measurable phone performance thresholds (agree limits before measuring);
- unapproved audio mood and technical proposals (sync/loudness/budget numbers in the audio doc stay provisional);
- PNG customisation sufficiency on a representative phone.

Keep deferred: tournaments, guilds, monetization (subscriptions/ads/shop/IAP), Redis, Kubernetes, microservices, multi-region writes, and other premature infrastructure. Deferring these keeps the first system inexpensive and comprehensible without closing later migration paths for the **pure** combat/domain packages.

## 15. Principal risks

| Risk                                                      | Mitigation                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Modular PNG customisation is unproven                     | Representative kit on an identified Android phone before catalogue growth; keep Carlos's concern open |
| Assembly inconsistency across surfaces                    | Identical assembly rules for stable, preview, and fight; immutable build/media versions on fights     |
| Phone performance (load, spikes, drops)                   | Agree limits, then measure a release build; Skia only if Animated fails those limits                  |
| Audio integration / missing packs                         | Separate audio files; base-pack fallback; missing audio must not block the fight; mood provisional    |
| Edge runtime compatibility                                | Benchmarks validate the chosen runtime; they do not reopen the stack as a fake gate                   |
| Atomic idempotent persistence across the Edge/DB boundary | One Postgres transaction via a database function; prove concurrency, failure, and retry               |
| Cross-runtime nondeterminism                              | Integer math, explicit PRNG, golden cross-target fixtures                                             |
| Analytics sprawl/privacy                                  | Typed allowlist, schema review, consent and retention policy                                          |
| Premature platform complexity                             | Cohesive modules, Postgres/Supabase-hosted work, measurement-based extraction                         |
| AI-generated architectural drift                          | AGENTS.md, dependency rules, ADRs, CI boundary tests                                                  |

## 16. Sources and verification notes

Current plan:

- [ADR-0001: Expo + React Native](docs/adr/0001-expo-react-native-game-client.md) — selected client; renderer-sufficiency language there is historical rationale, not measured proof of the modular kit.
- [ADR-0003: TypeBox](docs/adr/0003-typebox.md) — contracts already chosen.
- [ADR-0004: Modular monolith](docs/adr/0004-modular-monolith.md) — cohesive modules / no premature microservices remain valid; one-API-plus-worker deployment is superseded.
- [ADR-0005: Deterministic replay storage](docs/adr/0005-deterministic-replay-storage.md) — full semantic events remain required; extend in documentation with immutable build/media versions without changing schemas or checksums.
- [ADR-0006: Fastify](docs/adr/0006-fastify.md) — superseded by the 7 November 2026 server decision.
- [ADR-0007: Supabase portability](docs/adr/0007-supabase-portability.md) — dedicated amendment pending; supersession note records Edge/database-function coupling.
- Frozen combat spec: [docs/architecture/combat-v1.md](docs/architecture/combat-v1.md)
- Checked-in overview: [docs/architecture/overview.md](docs/architecture/overview.md)
- Agent guidelines: `AGENTS.md` / `docs/agent/AGENT_GUIDELINES.md`; pending kickoff PR https://github.com/gassius/botore/pull/6
- [Art Direction v0.1](https://app.clickup.com/90122060531/docs/2kxv30qk-232/2kxv30qk-332)
- [Sound FX & Music Guidelines](https://app.clickup.com/90122060531/docs/2kxv30qk-1072)
- [Supabase local development](https://supabase.com/docs/guides/local-development) and [CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows) — local stack, migrations and seeds.
- [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting) — operational responsibilities if self-hosting is later chosen; not a no-change portability promise.
- `docs/agent/PLAN.md` — historical bootstrap plan (Fastify/Cocos); dated environment findings are history, not current verification.

Historical engine research (not current selection):

- [Cocos Creator product page](https://www.cocos.com/en/creator)
- [Cocos engine repository](https://github.com/cocos/cocos-engine)
- [Cocos Creator TypeScript manual](https://docs.cocos.com/creator/1.10/manual/en/scripting/typescript.html)
- [Godot license](https://godotengine.org/license/)

Existing vendor links are references, not newly verified capabilities or legal advice. All vendor capabilities and terms should be rechecked when versions are pinned and before release.

### Still open (report to Carlos; this assignment does not close them)

- Art style and visual tokens remain undecided / provisional.
- Audio mood and unapproved audio technical proposals remain provisional.
- PNG customisation sufficiency on a representative phone is unproven.
- Agreed native performance limits have not been set or measured here.
- Dedicated ADR-0007 amendment is not written.
- Edge Function paths, RPC signatures, and runtime compatibility are not shipped or proven in this documentation pass.
- Evaluation cost, generation credit cost, and supervision time are unknown until recorded.
