# Botore Privacy Policy

**Last updated:** 10 November 2026  
**Ticket:** [R6: Privacy policy disclosure for platform auth + deletion](https://app.clickup.com/t/1amjtreyb0k)

Engineering disclosure for App Store / Play store readiness. Not a law-firm
engagement unless Carlos asks.

Player-facing copy (in-app + public `/privacy`) lives in
`apps/game/src/legal/privacyPolicyContent.ts`. **Keep that file free of
internal ops notes** (no Carlos / R4 / “outside counsel” / repo paths). This
markdown holds engineering / store-readiness notes. R6 stacks on R5 so
deletion claims match the shipped soft-delete path.

## Public URL

| Surface                      | Path              |
| ---------------------------- | ----------------- |
| Privacy policy (this notice) | `/privacy`        |
| Account deletion (R5)        | `/account/delete` |

Host: game web export (`apps/game` on Vercel). Attach a **custom domain** (or
otherwise SSO-free origin) so store reviewers can open these paths without
Vercel SSO. Optional client env `EXPO_PUBLIC_PUBLIC_WEB_ORIGIN` (no trailing
slash) makes absolute links for in-app disclosure — required for a tappable
deletion link on native (`Linking.openURL` rejects relative paths).

In-app: **Stable → Privacy policy** (temporary until C9 Settings merges).

## Platform identity and sign-in

- **iOS:** Game Center identity proof → Edge `platform-auth`.
- **Android:** Play Games Services proof when configured → same Edge function.
- **Device fallback:** random UUID in secure on-device storage (iOS Keychain /
  Android Keystore via `expo-secure-store`) when a platform proof is
  unavailable. **Never** IDFV / ANDROID_ID. Android Block Store is **not**
  implemented yet — do not claim it in player copy until that native module
  lands.
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
- If an Auth user is deleted or banned, **refresh is blocked**; an already-issued
  access JWT remains valid until it expires (Supabase default ≈ 1 hour), aside
  from RPCs that check `deleted_at`.

## What we store

- Account / profile (display name), characters, loadouts, fight allowances.
- Append-only inventory and battle ledgers.
- Platform identity mappings (provider + platform id → account).
- Optional crash / uncaught-error reports via **Sentry** on preview/production
  when a DSN is configured (`docs/architecture/crash-reporting.md`). Not a
  product analytics stack. Typical fields: stack traces, breadcrumbs, device
  model, OS version, app version. Scrubber strips passwords, tokens, cookies,
  and email-shaped fields where possible. Sentry may store reports **outside
  the EU**. Local Metro needs no Sentry account.

## Account deletion (R5)

Players can request deletion:

1. **In-app:** Stable → Delete account (type `DELETE`); optional mint of a
   one-time web code. Move under Settings when C9 merges.
2. **Public web:** `/account/delete` with the one-time code.

Server policy (soft-delete): mark `accounts.deleted_at`, anonymize display
names, unlink identities / devices / consents, rewrite Auth email and ban so
the same Game Center / Play Games id can mint a **new** account. Append-only
ledgers and battle rows remain as anonymous tombstones — hard-delete of every
historical row is not possible.

Details: `docs/backend/account-deletion.md`.

## Data retention

- Active gameplay data while the account is in use.
- After deletion: identity links removed; anonymized ledger / battle tombstones
  may be retained for integrity.
- Crash report retention follows the Sentry project policy when enabled.

## Store listing (R4) — ops

Use the absolute privacy URL (custom domain + `/privacy`) in App Store / Play
listing privacy fields and data-safety questionnaires. Pair with the absolute
deletion URL (`…/account/delete`). Before wide store submission also publish:
controller identity + privacy contact email or form; data-subject rights;
processors (Supabase, Sentry, Vercel, Apple/Google as identity providers).

## Contact

Store support channel once R4 publishes it; product owner Carlos for disclosure
questions. Do not put Carlos’s name or “outside counsel” wording in the
player-facing `privacyPolicyContent.ts`.
