/**
 * Public Supabase client config (anon key only).
 * Never read service-role keys into the Expo client.
 */
export type SupabasePublicConfig = {
  readonly url: string;
  readonly anonKey: string;
};

function readEnv(name: string): string | undefined {
  // Expo inlines EXPO_PUBLIC_* at bundle time.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const value = env?.[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = readEnv('EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;
  if (/service_role/i.test(anonKey)) {
    throw new Error('Refusing to load a service_role key into the game client');
  }
  return { url: url.replace(/\/$/, ''), anonKey };
}
