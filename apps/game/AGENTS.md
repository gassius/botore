# AGENTS.md — @botore/game (Expo App Client)

This is the Expo/React Native game client for Botore. Prefer patterns that work on
web export now and remain viable for iOS/Android later. Respect monorepo package
boundaries in the root `AGENTS.md`.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely
renamed, moved, or removed. Before writing any code that touches an Expo, EAS,
or React Native API:

1. Read the major version of the `expo` package in `apps/game/package.json`
   (currently Expo SDK 52).
2. Fetch the matching versioned docs:
   `https://docs.expo.dev/versions/v52.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all
   Expo docs with corrections to common LLM misconceptions. Follow its links;
   never answer from memory.

## Agent tooling (Expo Skills + MCP)

Project context for agents is committed at the monorepo root (`AGENTS.md`) and here. Also:

- **Expo MCP (Cursor):** `.cursor/mcp.json` registers
  `https://mcp.expo.dev/mcp`. If Expo is already connected in Cursor, nothing
  further is required for this setup. On a new machine only, complete OAuth
  when Cursor prompts.
- **Expo Skills (per machine, optional if already installed):**
  `pnpm dlx skills add expo/skills` — then reopen Cursor and confirm skills
  under Settings → Rules, Skills, Subagents.
- **Local MCP capabilities** (`expo-mcp`, simulator screenshots/automation)
  require Expo SDK 54+. Do not add `expo-mcp` until this app is upgraded past
  SDK 52.

Docs: https://docs.expo.dev/agents.md · https://docs.expo.dev/skills.md ·
https://docs.expo.dev/mcp.md

## Commands

From the monorepo root, prefer workspace filters. Always use `expo install` for
Expo-related packages (not raw `pnpm add`) so versions match the SDK:

```bash
pnpm --filter @botore/game exec expo install <package>
pnpm --filter @botore/game start          # expo start
pnpm --filter @botore/game web            # expo start --web
pnpm --filter @botore/game export:web     # web export
pnpm --filter @botore/game test
pnpm --filter @botore/game typecheck
pnpm --filter @botore/game lint
pnpm --filter @botore/game exec expo-doctor
pnpm --filter @botore/game exec expo install --fix
```

Run lint and typecheck for `@botore/game` before declaring Expo work done.

## App structure (current)

- Entry: `index.js` → `App.tsx`; playback logic under `src/`.
- This client does **not** use Expo Router yet. Do not introduce `expo-router`
  or restructure into `src/app/` unless a task explicitly requires it.
- Framework-free core stays in packages (`@botore/replay`, combat-engine, etc.);
  this app renders and plays back — it must not import server code.

## Building with EAS

Use EAS when native builds or OTA updates are needed (`eas build`, `eas submit`,
`eas update`). Prefer `npx eas-cli@latest` (or `pnpm exec eas-cli`) over a bare
`eas` binary. Docs: https://docs.expo.dev/eas/index.md

Profiles live in `eas.json`. The `design-review` profile bakes
`EXPO_PUBLIC_DESIGN_CAPTURE=1` for native phone screenshots/clips. See
`docs/architecture/native-design-captures.md` and
`scripts/native-capture/`. Web preview is not design-review acceptance.

Production / signing (R2): leave `extra.eas.projectId` **absent** until
Carlos runs `eas login` + `eas init` (or the first `eas build`). `eas init`
writes `projectId`; commit that change. Checklist (Apple/Play, secrets
locations, preview vs production Supabase public env, remote
`appVersionSource`): `docs/architecture/eas-production-credentials.md`. Do
not invent UUIDs or store credentials in git.

Crash reporting (R3): `@sentry/react-native` initializes only when a DSN is
present and the playable/production gate allows it (`src/crashReporting/`).
DEV / `design-review` bake `EXPO_PUBLIC_CRASH_REPORTING=0`. See
`docs/architecture/crash-reporting.md` for Carlos provisioning (DSN, org,
`SENTRY_AUTH_TOKEN`, EAS `projectId` via R2) and the forced test-error path.

## Native design captures (C7)

```bash
# After a capture-mode native run is on an emulator/device:
node scripts/native-capture/check-capture-env.mjs --platform android
./scripts/native-capture/run-design-capture.sh --platform android --routes Stable,Replay
```

Optional CI: `.github/workflows/native-design-captures.yml` (`workflow_dispatch`).

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (CNG).
  Never create or edit them by hand — configure native behavior in `app.json`
  and config plugins.
- Prefer recommended Expo modules over third-party libraries when adding native
  capability. Check Expo Skills before adding dependencies.
- Keep web export working (`expo export --platform web` / `vercel.json`).
