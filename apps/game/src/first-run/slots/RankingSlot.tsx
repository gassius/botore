import React from 'react';
import { RankingScreen } from '../../screens/RankingScreen';
import { useFirstRun } from '../FirstRunContext';

/**
 * Route slot: Ranking — ticket 1amjtrey0ex.
 * Mounts RankingScreen (DEV fixtures + RankingReadPort). No client reordering.
 */
export function RankingSlot(): React.ReactElement {
  const { goTo } = useFirstRun();

  return <RankingScreen onBack={() => goTo('Stable')} />;
}
