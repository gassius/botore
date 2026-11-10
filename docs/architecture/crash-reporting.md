# Crash reporting (R3)

Native iOS/Android crash and uncaught-error reporting for **preview** and
**production** (playable) EAS profiles, using `@sentry/react-native` (Expo SDK
52). This is **not** a product analytics stack. Local `pnpm start` does **not**
require a Sentry (or any cloud) account.

Ticket: [R3 · Crash reporting on release builds](https://app.clickup.com/t/1amjtrey7v9).

## Behaviour

| Profile / context                        | Reporter                                     |
| ---------------------------------------- | -------------------------------------------- |
| Metro `__DEV__` / local `pnpm start`     | Off (no DSN required)                        |
| EAS `development` / `design-review`      | Forced off (`EXPO_PUBLIC_CRASH_REPORTING=0`) |
| EAS `preview` / `production`             | On when DSN is baked                         |
| Explicit `EXPO_PUBLIC_CRASH_REPORTING=0` | Always off                                   |
| Explicit `EXPO_PUBLIC_CRASH_REPORTING=1` | On when DSN present (even under DEV if set)  |

Code: `apps/game/src/crashReporting/`. Entry wires `initCrashReporting()` +
`wrapRootComponent()` from `apps/game/index.js`. Metro uses
`getSentryExpoConfig` so release bundles get Debug IDs for source maps.

## PII / secrets

- `sendDefaultPii: false`
- No session replay / tracing product (`tracesSampleRate: 0`)
- `beforeSend` scrubber strips passwords, tokens, `service_role`, cookies,
  emails, and IP-shaped user fields (`scrub.ts`)
- Never put service-role keys or `SENTRY_AUTH_TOKEN` in `EXPO_PUBLIC_*`

## Carlos must provision (blocker for live proof)

Until these exist, the scaffold is code + docs only — builds succeed, but no
events appear in a dashboard and symbolication upload is skipped.

1. **Sentry org + project** — replace `REPLACE_SENTRY_ORG` /
   `REPLACE_SENTRY_PROJECT` in `apps/game/app.json` (plugin) **or** set EAS
   env `SENTRY_ORG` / `SENTRY_PROJECT`.
2. **Public DSN** — EAS env/secret `EXPO_PUBLIC_SENTRY_DSN` for `preview` and
   `production` profiles.
3. **Auth token** — EAS secret `SENTRY_AUTH_TOKEN` (sensitive) so native builds
   upload source maps and debug symbols.
4. **EAS `projectId` / signing** — owned by **R2**. Crash reporting does not
   invent an Expo project; once R2 lands `extra.eas.projectId` and credentials,
   re-stack / rebuild preview to prove upload. Native GitHub stack onto R2 only
   if that PR is the hard dependency for merge order.

## Forced native / JS error path (internal proof)

1. Bake a **preview** (or internal) build with:
   - `EXPO_PUBLIC_CRASH_REPORTING=1` (already on the `preview` profile)
   - `EXPO_PUBLIC_SENTRY_DSN=<real dsn>`
   - `EXPO_PUBLIC_CRASH_REPORTING_FORCE_TEST=1` (proof only — never store)
2. Install and cold-start the binary. On boot the client calls
   `Sentry.captureException(new Error('BotoreForcedCrashReportingTest'))`.
3. Confirm the issue in the Sentry project dashboard (symbolicated stack once
   maps uploaded).
4. Optional hard native crash from a QA build / console:
   `forceCrashReportingTestError({ native: true })` → `Sentry.nativeCrash()`.

Without the DSN / token, this path is still present in code but **cannot** be
proven against a live dashboard — mark that proof **unknown**, not done.

## Symbolication / source maps (EAS)

- Config plugin `@sentry/react-native/expo` hooks iOS/Android release builds to
  upload JS source maps and native debug symbols when `SENTRY_AUTH_TOKEN` is
  present.
- Metro Debug IDs come from `@sentry/react-native/metro` (`metro.config.js`).
- After `eas update`, upload OTA maps separately if used:
  `npx sentry-expo-upload-sourcemaps dist` (needs `SENTRY_ORG`,
  `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`).
- Verify: release/preview binary → forced error → open issue → frames resolve
  to TypeScript / app sources, not only minified bundle lines.

## Package boundaries

- Sentry stays in `apps/game` only. Do not import `@sentry/*` from pure
  packages (`rng`, `replay`, `domain`, `combat-engine`) or from `apps/api`.
- Run `node scripts/check-boundaries.mjs` after changes.
