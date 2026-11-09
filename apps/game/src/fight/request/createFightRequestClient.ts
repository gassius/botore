import { readSupabasePublicConfig } from '../../garage/auth/supabasePublicConfig';
import { getSharedDevFightBackend } from '../dev/DevFightBackendState';
import { DevFightRequestAdapter } from './DevFightRequestAdapter';
import type { FightRequestPort } from './FightRequestPort';
import { SupabaseFightRequestAdapter } from './SupabaseFightRequestAdapter';

/** Prefer live combat-v1 Edge Function when public env is present. */
export function createFightRequestClient(): FightRequestPort {
  const config = readSupabasePublicConfig();
  if (config) return new SupabaseFightRequestAdapter(config);
  return new DevFightRequestAdapter(getSharedDevFightBackend());
}
