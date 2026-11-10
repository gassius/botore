# Botore Privacy Policy

**Last updated:** 10 November 2026  
**Ticket:** [R6: Privacy policy disclosure for platform auth + deletion](https://app.clickup.com/t/1amjtreyb0k)

Engineering disclosure for App Store / Play store readiness. Not a law-firm
engagement unless Carlos asks. Keep this file aligned with
`apps/game/src/legal/privacyPolicyContent.ts` (in-app + public web).

## Public URL

| Surface                      | Path              |
| ---------------------------- | ----------------- |
| Privacy policy (this notice) | `/privacy`        |
| Account deletion (R5)        | `/account/delete` |

Host: game web export (`apps/game` on Vercel). Attach a **custom domain** (or
otherwise SSO-free origin) so store reviewers can open these paths without
Vercel SSO. Optional client env `EXPO_PUBLIC_PUBLIC_WEB_ORIGIN` (no trailing
slash) makes absolute links for in-app disclosure.

In-app: **Stable → Privacy policy** (temporary until C9 Settings merges).

## Platform identity and sign-in

- **iOS:** Game Center identity proof → Edge `platform-auth`.
- **Android:** Play Games Services proof when configured → same Edge function.
- **Device fallback:** random UUID in iOS Keychain / Android Block Store when a
  platform proof is unavailable. **Never** IDFV / ANDROID_ID.
- Client does not write `player_identities` directly; server validates and
  upserts.
- Web preview uses a separate Development password path
  (`docs/backend/web-preview-auth.md`), not the store native flow.

Details: `docs/backend/platform-auth.md`.

## Synthetic server emails

Platform-auth mints Supabase Auth sessions with synthetic addresses
`*@players.botore.internal`. These are **not** player-supplied emails and are
not used to contact players. They exist only so Auth can issue a session after
a verified Game Center, Play Games, or device-fallback proof.

## Session handling

- Access / refresh tokens are stored on device and restored on relaunch while
  valid.
- Sign out clears the local session.
- A deleted / banned Auth user cannot keep using the old session.

## What we store

- Account / profile (display name), characters, loadouts, fight allowances.
- Append-only inventory and battle ledgers.
- Platform identity mappings (provider + platform id → account).
- Optional crash / uncaught-error reports via Sentry on preview/production when
  a DSN is configured (`docs/architecture/crash-reporting.md`). Not a product
  analytics stack; scrubber strips passwords, tokens, cookies, and email-shaped
  fields where possible. Local Metro needs no Sentry account.

## Account deletion

Players can request deletion:

1. **In-app** (R5): Stable → Delete account (type `DELETE`); optional mint of a
   one-time web code. Move under Settings when C9 merges.
2. **Public web** (R5): `/account/delete` with the one-time code.

Server policy (soft-delete): mark `accounts.deleted_at`, anonymize display
names, unlink identities / devices / consents, rewrite Auth email and ban so
the same Game Center / Play Games id can mint a **new** account. Append-only
ledgers and battle rows remain as anonymous tombstones — hard-delete of every
historical row is not possible.

Details: `docs/backend/account-deletion.md` (lands with R5 #55).

## Data retention

- Active gameplay data while the account is in use.
- After deletion: identity links removed; anonymized ledger / battle tombstones
  may be retained for integrity.
- Crash report retention follows the Sentry project policy when enabled.

## Store listing (R4)

Use the absolute privacy URL (custom domain + `/privacy`) in App Store / Play
listing privacy fields and data-safety questionnaires. Pair with the absolute
deletion URL (`…/account/delete`). Do not invent product promises beyond Art
Direction and this disclosure.

## Contact

Store support channel once R4 publishes it; product owner Carlos for disclosure
questions.
