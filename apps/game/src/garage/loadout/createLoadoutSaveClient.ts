import { isDevScaffoldAllowed } from '../../runtime/devScaffoldPolicy';
import { readSupabasePublicConfig } from '../auth/supabasePublicConfig';
import { DevLoadoutSaveAdapter } from './DevLoadoutSaveAdapter';
import type { LoadoutSavePort } from './LoadoutSavePort';
import { SupabaseLoadoutSaveAdapter } from './SupabaseLoadoutSaveAdapter';
import { UnavailableLoadoutSaveAdapter } from './UnavailableLoadoutSaveAdapter';

/**
 * Prefer live loadout RPCs when public env is present.
 * DEV scaffold only when explicitly allowed; otherwise fail closed.
 */
export function createLoadoutSaveClient(): LoadoutSavePort {
  const config = readSupabasePublicConfig();
  if (config) return new SupabaseLoadoutSaveAdapter(config);
  if (isDevScaffoldAllowed()) return new DevLoadoutSaveAdapter();
  return new UnavailableLoadoutSaveAdapter();
}
