# Platform auth (C12) — Game Center / Play Games → Edge

Native first-run auth does **not** use Supabase anonymous sign-in or
`signInWithIdToken`. Flow:

1. Client restores a cached Supabase session if still valid.
2. Else collect a **platform proof** (iOS Game Center or Android Play Games).
3. `POST /functions/v1/platform-auth` verifies the proof, upserts
   `player_identities`, mints a session via `auth.admin.generateLink(magiclink)`
   - `verifyOtp` / client `setSession`.
4. If platform proof is unavailable: random UUID in iOS Keychain
   (`expo-secure-store`) / Android Block Store → same Edge function as
   `device_fallback`; link after the next successful platform sign-in.
   **Never** IDFV / ANDROID_ID.

Web preview stays on the separate Development-user password path
(`docs/backend/web-preview-auth.md`).

## Edge Function

```bash
pnpm exec supabase functions serve platform-auth
deno test -A --config=supabase/functions/platform-auth/deno.json supabase/functions/platform-auth
```

`config.toml`: `[functions.platform-auth] verify_jwt = false` (auth is the
job; service role is used inside).

### Request shapes

```json
{ "provider": "game_center",
  "teamPlayerID": "…", "bundleId": "com.botore.game",
  "publicKeyURL": "https://static.gc.apple.com/…",
  "signature": "<base64>", "salt": "<base64>", "timestamp": 1700000000000,
  "fallbackDeviceId": "<optional uuid>" }

{ "provider": "play_games",
  "serverAuthCode": "…",
  "fallbackDeviceId": "<optional uuid>" }

{ "provider": "device_fallback", "deviceId": "<uuid>" }
```

### Response

```json
{ "ok": true, "provider": "game_center", "platformId": "…",
  "session": { "access_token": "…", "refresh_token": "…", "expires_at": …, "user_id": "…", "email": "…" } }
```

Synthetic emails are `*@players.botore.internal` (server-only).

## Schema

Migration `0023_player_identities.sql`: unique `(provider, platform_id)` →
`accounts`. Client SELECT of own rows only; writes are service_role / Edge.

## Carlos setup checklist

### iOS (Game Center)

- [ ] Xcode capability **Game Center** on `com.botore.game`
- [ ] App Store Connect / Apple Developer: Game Center enabled for the app id
- [ ] Device / simulator Game Center sandbox account for QA
- [ ] Confirm bundle id matches Edge `bundleId` checks (`com.botore.game`)

### Android (Play Games Services v2)

- [ ] Play Console → Play Games Services for the Botore app
- [ ] Create / link **Web application** OAuth client; copy **Web client ID**
- [ ] Store web client **secret** as Edge secret `PLAY_GAMES_WEB_CLIENT_SECRET`
      (never in the app bundle)
- [ ] Set Edge secrets:
  - `PLAY_GAMES_WEB_CLIENT_ID`
  - `PLAY_GAMES_WEB_CLIENT_SECRET`
  - `PLAY_GAMES_APPLICATION_ID` (Play Games application id)
- [ ] App Signing SHA-1 registered on the OAuth / Play Games credentials
- [ ] PGS v2 auto sign-in configured; client uses
      `requestServerSideAccess(webClientId)` (needs **dev build**, not Expo Go)

### Expo native module

- [ ] Prefer `@tubinex/expo-game-services` (`requestServerIdentityProof`) when
      it covers GC + PGS proof collection
- [ ] Else thin custom Expo module for GC `fetchItems` + PGS server auth code
- [ ] Requires EAS **development** / preview **dev client** — not Expo Go

### Supabase project (Development) — Infra handoff

Agent cannot deploy: Supabase MCP auth was declined; no project credentials in this
VM. **Supabase Infra** (or Carlos) must run against the **Development** project:

```bash
# From repo root, linked to Development (or with --project-ref <dev-ref>)
pnpm exec supabase db push
# applies supabase/migrations/0023_player_identities.sql

pnpm exec supabase functions deploy platform-auth --no-verify-jwt
# config.toml already has [functions.platform-auth] verify_jwt = false
```

Confirm after deploy:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/platform-auth" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"provider":"device_fallback","deviceId":"00000000-0000-4000-8000-0000000000aa"}'
# expect HTTP 200, ok:true, session.access_token present
```

- [ ] Apply migration `0023_player_identities`
- [ ] Deploy Edge Function `platform-auth` (service role available to the function)
- [ ] Confirm hosted Dev does **not** need anonymous sign-ins for this path
- [ ] Smoke `device_fallback` as above (today’s Android APK path — no PGS secrets required)

### Today’s Android APK (device-fallback only)

PGS / Play Console / SHA-1 / `PLAY_GAMES_*` Edge secrets are **not** required for
silent first launch today. The client has **no** `@tubinex/expo-game-services`
dependency yet, so `collectPlatformProof()` returns null and
`signInWithNativePlatformIdentity` always POSTs `provider: "device_fallback"`
with a SecureStore UUID. That needs only Migration `0023` + deployed
`platform-auth` + `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
in the APK.

ClickUp: [C12](https://app.clickup.com/t/1amjtrey7v7).
