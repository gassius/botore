# Web-preview Development auth (C12)

First-run silent auth entry point (no `AuthEntryScreen`):

1. Restore a persisted session when present.
2. **Web preview only** — when `EXPO_PUBLIC_WEB_PREVIEW_AUTH` is set and the
   runtime is not native mobile, password-grant as Development user
   `dev@botore.local`. Password from
   `EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD` (Vercel / build-time public env).
   **Never commit the password.** Native EAS profiles must not bake either
   variable.
3. **Native / non-preview** — same entry point calls
   `nativePlatformIdentity.ts` → Edge `platform-auth`:
   - Prefer Game Center / Play Games proof via `@tubinex/expo-game-services`
     (EAS **dev build**, not Expo Go).
   - Else device-fallback UUID in SecureStore / Keychain (never IDFV /
     ANDROID_ID).
   - Edge mints a session with `generateLink(magiclink)` + `verifyOtp`
     (not anonymous, not `signInWithIdToken`). See
     [`platform-auth.md`](./platform-auth.md).

Supabase **anonymous** sign-in is **not** the product path. Local
`config.toml` does not require `enable_anonymous_sign_ins` for C12.

## Env (web preview)

```bash
EXPO_PUBLIC_WEB_PREVIEW_AUTH=1
EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD=   # Vercel secret / env — never commit
EXPO_PUBLIC_SUPABASE_URL=…
EXPO_PUBLIC_SUPABASE_ANON_KEY=…
```

## Failure UX

Missing flag/password, network/auth failure, or Edge reject →
`SessionAuthErrorScreen` (retry). Never DEV AuthEntry fallback on the
first-run path.

ClickUp: [C12](https://app.clickup.com/t/1amjtrey7v7).
