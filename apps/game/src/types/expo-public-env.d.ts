/**
 * Ambient Expo public env — Metro inlines static `process.env.EXPO_PUBLIC_*`
 * member expressions at bundle time.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    /** Release-build opt-in for BotorePerf frame sampling (`1` enables). */
    EXPO_PUBLIC_PERF_SAMPLE?: string;
    /** Optional load verdict mode: `warm` | `cold`. Unset = report only. */
    EXPO_PUBLIC_PERF_LOAD_KIND?: string;
    /**
     * Design-review native capture mode (`1` / `true`).
     * Auto DEV sign-in + deep-link route jumps. Never for store builds.
     */
    EXPO_PUBLIC_DESIGN_CAPTURE?: string;
    /** Optional initial first-run route when design capture is enabled. */
    EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE?: string;
    /** Optional demo paint id for capture boots (e.g. petrol). */
    EXPO_PUBLIC_DESIGN_CAPTURE_PAINT?: string;
    /** Optional demo weapon id for capture boots (e.g. axe). */
    EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON?: string;
    /**
     * C3 live first-run fight capture (`1` / `true`).
     * Requires design-capture + baked Supabase public env. Never for store builds.
     */
    EXPO_PUBLIC_DESIGN_CAPTURE_LIVE_FIGHT?: string;
    /**
     * Explicit DEV scaffold opt-in (`1` / `true`).
     * Baked by EAS `design-review` / `development` only — never preview/production.
     */
    EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD?: string;
    /**
     * Force fail-closed blocked UI under design-capture (C8 evidence).
     * Never for store builds.
     */
    EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED?: string;
    /**
     * C11: ConfirmFight dual-fighter quick vs heavy pose stills under design-capture.
     * Never for store builds.
     */
    EXPO_PUBLIC_DESIGN_CAPTURE_POSE_COMPARE?: string;
    /**
     * C10: force offline / auth-expired banners under design-capture
     * (`offline` | `auth_expired`). Never for store builds.
     */
    EXPO_PUBLIC_DESIGN_CAPTURE_SESSION_FAILURE?: string;
    /**
     * R3 Sentry public DSN. When unset, crash reporting stays disabled
     * (local Metro needs no cloud account).
     */
    EXPO_PUBLIC_SENTRY_DSN?: string;
    /**
     * R3 crash reporting gate: `1` enable (preview/production), `0` force off
     * (DEV / design-review). Unset → infer from playable fail-closed policy.
     */
    EXPO_PUBLIC_CRASH_REPORTING?: string;
    /**
     * Internal proof build only: capture a forced test error after init.
     * Never bake into store production.
     */
    EXPO_PUBLIC_CRASH_REPORTING_FORCE_TEST?: string;
    /**
     * Design-capture cold-start: native splash hold ms after hold-title is known.
     * CI live-fight bakes ≥60000 so GHA SpringBoard cannot outlast splash.
     * Unset → 8000.
     */
    EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS?: string;
    /**
     * Web-preview silent Development auth (`1` / `true`).
     * Vercel / web preview only — never bake into native EAS profiles.
     */
    EXPO_PUBLIC_WEB_PREVIEW_AUTH?: string;
    /**
     * Password for web-preview `dev@botore.local` (Vercel / build env only).
     * Never commit a real value. Ignored on native runtimes.
     */
    EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD?: string;
  }
}
