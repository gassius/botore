import { readSupabasePublicConfig } from '../auth/supabasePublicConfig';
import { DevLoadoutSaveAdapter } from './DevLoadoutSaveAdapter';
import type { LoadoutSavePort } from './LoadoutSavePort';
import { SupabaseLoadoutSaveAdapter } from './SupabaseLoadoutSaveAdapter';

export function createLoadoutSaveClient(): LoadoutSavePort {
  const config = readSupabasePublicConfig();
  if (config) return new SupabaseLoadoutSaveAdapter(config);
  return new DevLoadoutSaveAdapter();
}
