import { readSupabasePublicConfig } from '../../garage/auth/supabasePublicConfig';
import { getSharedDevFightBackend } from '../dev/DevFightBackendState';
import { DevOpponentCandidatesAdapter } from './DevOpponentCandidatesAdapter';
import type { OpponentCandidatesPort } from './OpponentCandidatesPort';
import { SupabaseOpponentCandidatesAdapter } from './SupabaseOpponentCandidatesAdapter';

/** Prefer live Supabase reads when public env is present; otherwise DEV scaffold. */
export function createOpponentCandidatesClient(): OpponentCandidatesPort {
  const config = readSupabasePublicConfig();
  if (config) return new SupabaseOpponentCandidatesAdapter(config);
  return new DevOpponentCandidatesAdapter(getSharedDevFightBackend());
}
