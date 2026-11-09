import { readSupabasePublicConfig } from '../garage/auth/supabasePublicConfig';
import type { DesignCaptureRankingScenario } from '../design-capture/captureEnv';
import { FixtureRankingReadAdapter } from './adapters/FixtureRankingReadAdapter';
import { SupabaseRankingReadAdapter } from './adapters/SupabaseRankingReadAdapter';
import type { RankingReadPort } from './RankingReadPort';

export type CreateRankingReadClientInput = {
  /** Authenticated access token for live reads. */
  accessToken?: string | null;
  /**
   * Design-capture override for empty/error stills.
   * `live` / null → prefer Supabase when configured + authed.
   */
  captureScenario?: DesignCaptureRankingScenario | null;
};

/**
 * Prefer live `list_ranking` when Supabase public env + JWT are present.
 * Design-capture empty/error forces DEV fixtures for those UI states.
 * Otherwise DEV fixtures (never presented as live players).
 */
export function createRankingReadClient(input: CreateRankingReadClientInput = {}): RankingReadPort {
  const scenario = input.captureScenario ?? null;
  if (scenario === 'empty') {
    return new FixtureRankingReadAdapter({ scenario: 'empty' });
  }
  if (scenario === 'error') {
    return new FixtureRankingReadAdapter({
      scenario: 'error',
      errorMessage: 'Design-capture ranking error state',
    });
  }

  const config = readSupabasePublicConfig();
  const token = input.accessToken?.trim() ?? '';
  if (config && token.length > 0) {
    return new SupabaseRankingReadAdapter(config, token);
  }

  return new FixtureRankingReadAdapter({ scenario: 'populated' });
}
