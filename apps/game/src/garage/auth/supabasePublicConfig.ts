/**
 * Public Supabase client config (anon key only).
 * Never read service-role keys into the Expo client.
 *
 * Expo inlines only static `process.env.EXPO_PUBLIC_*` member expressions.
 * Do not alias `process.env` or index it dynamically — those reads stay empty
 * in release bundles and would silently fall back to DEV adapters.
 * @see https://docs.expo.dev/guides/environment-variables/#how-to-read-from-environment-variables
 */
export type SupabasePublicConfig = {
  readonly url: string;
  readonly anonKey: string;
};

function trimPublic(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readSupabasePublicConfig(): SupabasePublicConfig | null {
  // Static property access — required for Expo Metro inlining.
  const url = trimPublic(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey = trimPublic(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anonKey) return null;
  if (/service_role/i.test(anonKey)) {
    throw new Error('Refusing to load a service_role key into the game client');
  }
  return { url: url.replace(/\/$/, ''), anonKey };
}
