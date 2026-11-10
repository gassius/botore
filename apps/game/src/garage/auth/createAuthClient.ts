import { isDevScaffoldAllowed } from '../../runtime/devScaffoldPolicy';
import type { AuthPort } from './AuthPort';
import { DevAuthAdapter } from './DevAuthAdapter';
import { SupabaseAuthAdapter } from './SupabaseAuthAdapter';
import { UnavailableAuthAdapter } from './UnavailableAuthAdapter';
import { readSupabasePublicConfig } from './supabasePublicConfig';

/**
 * Prefer live Supabase Auth when public env is present.
 * DEV scaffold only when explicitly allowed (design-capture / development).
 * Preview/production fail closed with an unavailable adapter.
 */
export function createAuthClient(): AuthPort {
  const config = readSupabasePublicConfig();
  if (config) return new SupabaseAuthAdapter(config);
  if (isDevScaffoldAllowed()) return new DevAuthAdapter();
  return new UnavailableAuthAdapter();
}
