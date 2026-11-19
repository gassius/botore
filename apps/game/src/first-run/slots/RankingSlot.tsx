import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { rankingTabForCaptureScenario } from '../../design-capture/captureEnv';
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import { RankingScreen } from '../../screens/RankingScreen';
import { useFirstRun } from '../FirstRunContext';

/**
 * Route slot: Ranking — D4 / 1amjtrezaj9 (E2 boards).
 * Live list_bot_ranking / list_botore_ranking when authed + Supabase;
 * capture bots/botores/empty/loading via scenario.
 * Header Back and Android hardware Back return to where Ranking was opened
 * (in-arena Result after a fight, otherwise Ludus).
 */
export function RankingSlot(): React.ReactElement {
  const { leaveRanking, rankingCaptureScenario } = useFirstRun();
  const { session, signOut } = useGarageSession();
  const initialTab = rankingTabForCaptureScenario(rankingCaptureScenario);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveRanking();
      return true;
    });
    return () => sub.remove();
  }, [leaveRanking]);

  return (
    <RankingScreen
      key={rankingCaptureScenario ?? 'default'}
      accessToken={session?.accessToken ?? null}
      captureScenario={rankingCaptureScenario}
      initialTab={initialTab}
      onBack={leaveRanking}
      onSignInAgain={() => {
        void signOut();
      }}
    />
  );
}
