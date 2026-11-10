import { readSupabasePublicConfig } from '../../garage/auth/supabasePublicConfig';
import { isDevScaffoldAllowed } from '../../runtime/devScaffoldPolicy';
import { getSharedDevFightBackend } from '../dev/DevFightBackendState';
import { DevOpponentCandidatesAdapter } from './DevOpponentCandidatesAdapter';
import type { OpponentCandidatesPort } from './OpponentCandidatesPort';
import { SupabaseOpponentCandidatesAdapter } from './SupabaseOpponentCandidatesAdapter';
import { UnavailableOpponentCandidatesAdapter } from './UnavailableOpponentCandidatesAdapter';

/**
 * Prefer live Supabase reads when public env is present.
 * DEV roster only when scaffolds are allowed; preview/production fail closed.
 */
export function createOpponentCandidatesClient(): OpponentCandidatesPort {
  const config = readSupabasePublicConfig();
  if (config) return new SupabaseOpponentCandidatesAdapter(config);
  if (isDevScaffoldAllowed()) {
    return new DevOpponentCandidatesAdapter(getSharedDevFightBackend());
  }
  return new UnavailableOpponentCandidatesAdapter();
}
