import type { AuthPort } from './AuthPort';
import { DevAuthAdapter } from './DevAuthAdapter';
import { SupabaseAuthAdapter } from './SupabaseAuthAdapter';
import { readSupabasePublicConfig } from './supabasePublicConfig';

/** Prefer live Supabase Auth when public env is present; otherwise DEV scaffold. */
export function createAuthClient(): AuthPort {
  const config = readSupabasePublicConfig();
  if (config) return new SupabaseAuthAdapter(config);
  return new DevAuthAdapter();
}
