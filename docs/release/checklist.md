# Store / TestFlight release checklist

Pre-flight for **wide** TestFlight or Play internal testing (beyond
engineering / design-review binaries). Docs only — no secrets, no console
uploads from this ticket.

Ticket: [R4](https://app.clickup.com/t/1amjtrey7vd). Related: [R2](https://app.clickup.com/t/1amjtrey7v5),
[R5](https://app.clickup.com/t/1amjtreyb0h), [R6](https://app.clickup.com/t/1amjtreyb0k),
[R3](https://app.clickup.com/t/1amjtrey7v9).

## Identity (config already in repo)

| Field | Value today | Owner |
| ----- | ----------- | ----- |
| App display name | `Botore` (`apps/game/app.json` → `expo.name`) | Engineering |
| Expo slug | `botore-game` | Engineering |
| iOS bundle id | `com.botore.game` | Engineering (stable until product renames) |
| Android package | `com.botore.game` | Engineering (stable until product renames) |
| App version | `0.1.0` (bump for store builds as needed) | Engineering |

Do **not** invent a new bundle / package id for listing drafts.

## R2 — credentials (Carlos-owned; placeholders only)

[R2](https://app.clickup.com/t/1amjtrey7v5) owns Expo/EAS project linkage and
signing. Full ops checklist:
[`docs/architecture/eas-production-credentials.md`](../architecture/eas-production-credentials.md).
**No secret values in git.** Real `projectId` / signing still need Carlos’s
Expo / Apple / Play accounts.

| Item | Placeholder / where it will live | Status |
| ---- | -------------------------------- | ------ |
| EAS `projectId` | `apps/game/app.json` → `extra.eas.projectId` placeholder `REPLACE_WITH_EAS_PROJECT_ID_VIA_EAS_INIT` until `eas init` | **Blocked on Carlos Expo account** |
| Apple Developer Team ID | Apple Developer → Membership (Carlos) | **Blocked on Carlos** |
| Apple distribution cert / provisioning | EAS credentials store (Carlos-linked Apple account) | **Blocked on Carlos** |
| App Store Connect app record | ASC for `com.botore.game` | **Blocked on Carlos** |
| Play Console app + signing key | Play Console / Play App Signing (Carlos) | **Blocked on Carlos** |
| EAS production / submit dry-run | `eas.json` `production` (store) + `submit.production` (Play internal draft) | **Blocked on Carlos credentials** |
| Supabase public URL + anon key (preview vs production) | EAS env for playable profiles — never service-role | Documented in R2 checklist; values stay in EAS / host secrets |

Engineering builds may still use `design-review` / `development` profiles with
`withoutCredentials: true` where configured — those are **not** store tracks.

## Privacy + deletion URLs (R5 / R6 shipped)

| Surface | Path | Absolute URL |
| ------- | ---- | ------------ |
| Privacy policy | `/privacy` | `{EXPO_PUBLIC_PUBLIC_WEB_ORIGIN}/privacy` |
| Account deletion | `/account/delete` | `{EXPO_PUBLIC_PUBLIC_WEB_ORIGIN}/account/delete` |

- In-repo draft / engineering notes: [`docs/legal/privacy-policy.md`](../legal/privacy-policy.md)
- Player-facing copy source: `apps/game/src/legal/privacyPolicyContent.ts`
- **Carlos:** attach an SSO-free custom domain (or equivalent public origin) to
  the `botore-game` Vercel project and set `EXPO_PUBLIC_PUBLIC_WEB_ORIGIN` (no
  trailing slash). Until then, `*.vercel.app` may require SSO and is **not**
  store-reviewer friendly.
- Paste the absolute privacy URL into App Store Connect Privacy Policy URL and
  Play Console Privacy policy / Data safety “privacy policy” fields.

## Listing + questionnaires (this ticket)

- [ ] Review listing copy in [`store-listing.md`](./store-listing.md)
- [ ] Capture store screenshots via native pipeline (same doc; **not** web)
- [ ] Fill Apple / Play questionnaires from [`store-questionnaires.md`](./store-questionnaires.md)
- [ ] Set support email / URL (placeholders in questionnaires — Carlos picks
      the real inbox; bake `EXPO_PUBLIC_ACCOUNT_DELETION_SUPPORT_EMAIL` on the
      public web host)

## Crash reporting (R3 scaffold)

- [ ] Sentry org / project / `EXPO_PUBLIC_SENTRY_DSN` / `SENTRY_AUTH_TOKEN` —
      Carlos provision per [`docs/architecture/crash-reporting.md`](../architecture/crash-reporting.md)
- [ ] Data-safety answers already assume optional Sentry crash reports when DSN
      is configured; if crash reporting stays off for a given build, answer
      “no crash logs collected” for that binary and re-check before enabling.

## Pre-submit smoke (after R2)

- [ ] Production (or internal TestFlight / Play internal) binary installs on a
      physical phone
- [ ] Silent platform auth (or device-fallback) works without DEV scaffolding
- [ ] Fail-closed without Supabase public env (C8)
- [ ] In-app delete + public `/account/delete` + `/privacy` reachable without SSO
- [ ] Mute / Settings persist (C9)
- [ ] No `EXPO_PUBLIC_DESIGN_CAPTURE=1` / force-crash flags on store binaries

## Verify (docs ticket)

- Checklist reviewed by Carlos
- No secrets committed
- Bundle / package ids match `apps/game/app.json`
