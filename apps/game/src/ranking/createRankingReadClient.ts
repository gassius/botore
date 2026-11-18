import { readSupabasePublicConfig } from '../garage/auth/supabasePublicConfig';
import type { DesignCaptureRankingScenario } from '../design-capture/captureEnv';
import { isDevScaffoldAllowed } from '../runtime/devScaffoldPolicy';
import { FixtureRankingReadAdapter } from './adapters/FixtureRankingReadAdapter';
import { SupabaseRankingReadAdapter } from './adapters/SupabaseRankingReadAdapter';
import { UnavailableContractRankingReadAdapter } from './adapters/UnavailableContractRankingReadAdapter';
import type { RankingReadPort } from './RankingReadPort';

/** Long enough that capture settle (~3–6s) still shows the loading spinner. */
const CAPTURE_LOADING_DELAY_MS = 120_000;

export type CreateRankingReadClientInput = {
  /** Authenticated access token for live reads. */
  accessToken?: string | null;
  /**
   * Design-capture override for empty/error/bots/botores/loading stills.
   * `live` / null → prefer Supabase when configured + authed.
   */
  captureScenario?: DesignCaptureRankingScenario | null;
};

/**
 * Prefer live E2 `list_bot_ranking` / `list_botore_ranking` when Supabase
 * public env + JWT are present. Design-capture bots/botores/empty/loading/error
 * forces DEV fixtures for those UI states. Otherwise DEV fixtures only when
 * scaffolds are allowed; else fail closed.
 */
export function createRankingReadClient(input: CreateRankingReadClientInput = {}): RankingReadPort {
  const scenario = input.captureScenario ?? null;
  if (scenario === 'empty') {
    return new FixtureRankingReadAdapter({ scenario: 'empty' });
  }
  if (scenario === 'loading') {
    return new FixtureRankingReadAdapter({
      scenario: 'populated',
      delayMs: CAPTURE_LOADING_DELAY_MS,
    });
  }
  if (scenario === 'bots' || scenario === 'botores') {
    return new FixtureRankingReadAdapter({ scenario: 'populated' });
  }
  if (scenario === 'error') {
    return new FixtureRankingReadAdapter({
      scenario: 'error',
      errorMessage: 'Could not load ranking.',
    });
  }
  if (scenario === 'offline') {
    return new FixtureRankingReadAdapter({ scenario: 'offline' });
  }
  if (scenario === 'auth_expired') {
    return new FixtureRankingReadAdapter({ scenario: 'auth_expired' });
  }

  const config = readSupabasePublicConfig();
  const token = input.accessToken?.trim() ?? '';
  if (config && token.length > 0) {
    return new SupabaseRankingReadAdapter(config, token);
  }

  if (isDevScaffoldAllowed()) {
    return new FixtureRankingReadAdapter({ scenario: 'populated' });
  }

  return new UnavailableContractRankingReadAdapter(
    'Ranking is blocked until EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set and you are signed in. DEV fixture rows are not used on playable builds.',
  );
}
