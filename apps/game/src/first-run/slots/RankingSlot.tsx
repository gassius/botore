import React from 'react';
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import { RankingScreen } from '../../screens/RankingScreen';
import { useFirstRun } from '../FirstRunContext';

/**
 * Route slot: Ranking — D4 / 1amjtrezaj9 (E2 boards).
 * Live list_bot_ranking / list_botore_ranking when authed + Supabase;
 * capture empty/error via scenario.
 */
export function RankingSlot(): React.ReactElement {
  const { goTo, rankingCaptureScenario } = useFirstRun();
  const { session, signOut } = useGarageSession();

  return (
    <RankingScreen
      accessToken={session?.accessToken ?? null}
      captureScenario={rankingCaptureScenario}
      onBack={() => goTo('Stable')}
      onSignInAgain={() => {
        void signOut();
      }}
    />
  );
}
