import React from 'react';
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import { RankingScreen } from '../../screens/RankingScreen';
import { useFirstRun } from '../FirstRunContext';

/**
 * Route slot: Ranking — C5 / 1amjtrey13p.
 * Live list_ranking when authed + Supabase; capture empty/error via scenario.
 */
export function RankingSlot(): React.ReactElement {
  const { goTo, rankingCaptureScenario } = useFirstRun();
  const { session } = useGarageSession();

  return (
    <RankingScreen
      accessToken={session?.accessToken ?? null}
      captureScenario={rankingCaptureScenario}
      onBack={() => goTo('Stable')}
    />
  );
}
