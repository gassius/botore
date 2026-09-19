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

Project context for agents is committed at the monorepo root (`AGENTS.md`,
`CLAUDE.md`, `.claude/settings.json`) and here. Also:

- **Expo MCP (Cursor):** `.cursor/mcp.json` registers
  `https://mcp.expo.dev/mcp` (OAuth). Authenticate once in Cursor after clone.
- **Expo Skills (per machine):**
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

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (CNG).
  Never create or edit them by hand — configure native behavior in `app.json`
  and config plugins.
- Prefer recommended Expo modules over third-party libraries when adding native
  capability. Check Expo Skills before adding dependencies.
- Keep web export working (`expo export --platform web` / `vercel.json`).
