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
  }
}
