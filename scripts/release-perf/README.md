# Native release-perf measure (R1 / F12 residual)

Measure a **release** Android binary on an identified physical phone (record
iOS if reachable). Expo web / Playwright numbers are never acceptance.

Contract: [`docs/architecture/android-release-perf.md`](../../docs/architecture/android-release-perf.md)

## Preferred envelope

After C8, prefer a **live sealed fight** (`envelope: live_sealed` on the
`BotorePerf` line). The EAS `release-perf` profile does **not** set
`EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD` — bake `EXPO_PUBLIC_SUPABASE_URL` +
`EXPO_PUBLIC_SUPABASE_ANON_KEY` at build time. If you must use a DEV golden
fixture, label the pass `dev_fixture` honestly (never as live).

## Build

```bash
cd apps/game
# Provide Supabase public env via EAS secrets / --env (not committed).
npx eas-cli@latest build -p android --profile release-perf --local
# or: npx expo run:android --variant release  with the same EXPO_PUBLIC_* baked
```

`release-perf` sets `EXPO_PUBLIC_PERF_SAMPLE=1` only. Leave
`EXPO_PUBLIC_PERF_LOAD_KIND` unset; declare warm/cold on the harness
(`--load-kind`) so one binary covers both load modes.

## Measure (Carlos / CI runner with a phone)

```bash
node scripts/release-perf/check-env.mjs --platform android
# Install the release-perf APK, sign in, run a live fight → Replay Play→END.

./scripts/release-perf/run-android-measure.sh \
  --pass-id sound-on-warm \
  --load-kind warm \
  --require-envelope live_sealed

./scripts/release-perf/run-android-measure.sh \
  --pass-id muted-warm \
  --load-kind warm \
  --require-envelope live_sealed

# Cold: clear app storage / pack cache, then:
./scripts/release-perf/run-android-measure.sh \
  --pass-id sound-on-cold \
  --load-kind cold \
  --require-envelope live_sealed

# Reduced motion: enable OS Reduce motion (or in-app override when Settings lands),
# then repeat sound-on + muted warm passes with distinct --pass-id values.
```

Attach `logcat-*.txt`, `pass-*.json`, and `device-*.json` on ClickUp
[R1](https://app.clickup.com/t/1amjtrey7v4). Copy
`results-template.json` → filled results for the tip SHA.

## Tools-only (no device)

```bash
node scripts/release-perf/check-env.mjs --platform android --tools-only
node --test scripts/release-perf/parse-botore-perf.test.mjs
```

## Non-goals

Web/Playwright as acceptance; inventing device metrics; catalogue expansion.
