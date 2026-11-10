# EAS production project + signing credentials (R2)

Make production native builds reproducible: Expo/EAS project identity, signing
for TestFlight and Play **internal** tracks, and documented env ownership.
**No secrets belong in git.**

Ticket: [R2 · EAS production project + signing credentials checklist](https://app.clickup.com/t/1amjtrey7v5).

## Status (agent-reachable)

| Item | State |
| ---- | ----- |
| `apps/game/eas.json` `production` + `submit.production` profiles | Present (structure verified; no credentialed build in this agent VM) |
| `extra.eas.projectId` in `apps/game/app.json` | **Placeholder** `REPLACE_WITH_EAS_PROJECT_ID_VIA_EAS_INIT` — Carlos must run `eas init` / login |
| Apple / Play signing secrets | **Not in repo** — Carlos/ops own; configure via EAS Credentials |
| Preview vs production Supabase public env | Documented below — bake via EAS env/secrets, never commit real values |
| Credentialed `eas build --profile production` | **Blocked** until Expo login + real `projectId` + signing credentials |

This agent had no `~/.expo` session (`eas whoami` unavailable). Do **not** invent
a UUID `projectId` or Apple/Play secrets to unblock CI.

## App identity (committed, non-secret)

| Platform | Field | Value |
| -------- | ----- | ----- |
| iOS | Bundle ID | `com.botore.game` (`app.json` → `expo.ios.bundleIdentifier`) |
| Android | Application ID | `com.botore.game` (`app.json` → `expo.android.package`) |
| Expo slug | `botore-game` | `app.json` → `expo.slug` |
| Display name | Botore | `app.json` → `expo.name` |

Apple Team ID, ASC App ID, Play Console package listing ownership, and upload
keystores are **not** committed — fill via EAS / store consoles (Carlos/ops).

## `eas.json` profiles (verified structure)

| Profile | Distribution | Notes |
| ------- | ------------ | ----- |
| `design-review` / `development` / `release-perf` | internal | Credential-less Android APK / iOS simulator where marked `withoutCredentials` |
| `preview` | internal | APK + iOS simulator; playable; needs Supabase public env via EAS secrets |
| `production` | **store** | `autoIncrement: true`; Android **app-bundle** (AAB); iOS store IPA (signing required) |
| `submit.production` | — | Android Play **internal** track, `releaseStatus: draft`; iOS ASC fields filled by Carlos at submit time (not invented here) |

Supabase URL/anon key and Sentry DSN are **not** hardcoded in `eas.json` —
set as EAS project environment / secrets per profile.

## Preview vs production env (Supabase public keys)

Only **public** client values. Never bake `service_role` into any EAS profile.

| Variable | Preview | Production | Where it lives |
| -------- | ------- | ---------- | -------------- |
| `EXPO_PUBLIC_SUPABASE_URL` | Hosted **Development** (or preview) Supabase project URL | Hosted **Production** Supabase project URL | EAS env/secret for that profile; local `.env` for Metro only |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Matching Development anon JWT | Matching Production anon JWT | Same — anon only |
| `EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD` | Must stay unset / off on preview | Must stay unset / off | Only `design-review` / `development` bake `1` |
| `EXPO_PUBLIC_CRASH_REPORTING` | `1` (preview profile) | `1` (production profile) | Already in `eas.json`; needs DSN from R3 |
| `EXPO_PUBLIC_SENTRY_DSN` | Optional until R3 provisioned | Optional until R3 provisioned | EAS secret — see `docs/architecture/crash-reporting.md` |
| `EXPO_PUBLIC_WEB_PREVIEW_AUTH` / `_DEV_PASSWORD` | **Never** on native EAS | **Never** | Vercel web preview only |

Local Metro: copy `apps/game/.env.example` → `.env` (gitignored). Playable
native builds fail closed without Supabase public env (C8).

## Ownership

| Asset | Owner | Location (never git) |
| ----- | ----- | -------------------- |
| Expo account + EAS project | Carlos / ops | expo.dev dashboard; `EXPO_TOKEN` for CI if used |
| `extra.eas.projectId` | Carlos (after `eas init`) | Committed once real UUID replaces placeholder |
| Apple Developer team, distribution cert, provisioning, ASC API key | Carlos / ops | Apple Developer + EAS Credentials (remote) |
| Play Console app, upload keystore / Play App Signing, service-account JSON for submit | Carlos / ops | Play Console + EAS Credentials |
| Supabase preview/production anon URL+key | Carlos / Supabase Infra | EAS secrets + Supabase dashboard |
| Sentry org/DSN/token | Carlos (R3) | EAS secrets — not this ticket |

## Carlos steps (exact)

Run from repo root after Expo login on a trusted machine:

```bash
cd apps/game
npx eas-cli@latest login
npx eas-cli@latest init
# Accept linking slug botore-game; replace REPLACE_WITH_EAS_PROJECT_ID_VIA_EAS_INIT
# in app.json with the real UUID eas init writes (commit that one-line change).

# Optional structure check without uploading (still needs login + projectId):
npx eas-cli@latest config --type build

# After Apple/Play credentials exist in EAS Credentials:
npx eas-cli@latest build -p android --profile production
npx eas-cli@latest build -p ios --profile production

# Internal tracks (not public store):
npx eas-cli@latest submit -p android --profile production
# iOS TestFlight: eas submit will prompt / use ASC API key held by Carlos/ops
npx eas-cli@latest submit -p ios --profile production
```

Apple (Carlos/ops):

1. Confirm Team ID for bundle `com.botore.game`.
2. Create/link App Store Connect app; note ASC App ID for later `submit.ios.ascAppId` if desired.
3. Let EAS manage distribution cert + provisioning **or** upload existing via `eas credentials`.
4. Prefer ASC API key (`EXPO_ASC_*` / EAS-managed) over interactive Apple ID on CI.

Play (Carlos/ops):

1. Create Play Console app with package `com.botore.game`.
2. Enable Play App Signing; store upload keystore in EAS Credentials (remote).
3. Create a Google Play service account with release access; assign in EAS for submit to **internal** track.
4. Do not commit the service-account JSON.

EAS secrets to set after projectId exists (names only):

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (per preview vs production environment)
- R3: `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- CI only if used: `EXPO_TOKEN`

## Dry-run notes (this agent)

- `eas.json` parses as JSON; `production` uses `distribution: store` + Android `app-bundle`.
- `submit.production.android.track` = `internal`, `releaseStatus` = `draft`.
- No Expo session → cannot run a real `eas build` or record a build URL.
- After Carlos lands `projectId` + credentials, record the first successful
  production build URL on the R2 ClickUp task.

## Non-goals

Public store listing copy (R4), crash SDK proof (R3), inventing credentials in
chat or git, merging without Carlos.
