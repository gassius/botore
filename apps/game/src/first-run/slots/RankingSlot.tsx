import React from 'react';
import { rankingTabForCaptureScenario } from '../../design-capture/captureEnv';
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import { RankingScreen } from '../../screens/RankingScreen';
import { useFirstRun } from '../FirstRunContext';

/**
 * Route slot: Ranking — D4 / 1amjtrezaj9 (E2 boards).
 * Live list_bot_ranking / list_botore_ranking when authed + Supabase;
 * capture bots/botores/empty/loading via scenario.
 */
export function RankingSlot(): React.ReactElement {
  const { goTo, rankingCaptureScenario } = useFirstRun();
  const { session, signOut } = useGarageSession();
  const initialTab = rankingTabForCaptureScenario(rankingCaptureScenario);

  return (
    <RankingScreen
      key={rankingCaptureScenario ?? 'default'}
      accessToken={session?.accessToken ?? null}
      captureScenario={rankingCaptureScenario}
      initialTab={initialTab}
      onBack={() => goTo('Stable')}
      onSignInAgain={() => {
        void signOut();
      }}
    />
  );
}
