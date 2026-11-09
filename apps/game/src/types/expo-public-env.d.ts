/**
 * Ambient Expo public env — Metro inlines static `process.env.EXPO_PUBLIC_*`
 * member expressions at bundle time.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  }
}
