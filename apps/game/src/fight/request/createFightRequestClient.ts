import { readSupabasePublicConfig } from '../../garage/auth/supabasePublicConfig';
import { isDevScaffoldAllowed } from '../../runtime/devScaffoldPolicy';
import { getSharedDevFightBackend } from '../dev/DevFightBackendState';
import { DevFightRequestAdapter } from './DevFightRequestAdapter';
import type { FightRequestPort } from './FightRequestPort';
import { SupabaseFightRequestAdapter } from './SupabaseFightRequestAdapter';
import { UnavailableFightRequestAdapter } from './UnavailableFightRequestAdapter';

/**
 * Prefer live combat-v1 Edge Function when public env is present.
 * DEV scaffold only when allowed; preview/production fail closed.
 */
export function createFightRequestClient(): FightRequestPort {
  const config = readSupabasePublicConfig();
  if (config) return new SupabaseFightRequestAdapter(config);
  if (isDevScaffoldAllowed()) {
    return new DevFightRequestAdapter(getSharedDevFightBackend());
  }
  return new UnavailableFightRequestAdapter();
}
