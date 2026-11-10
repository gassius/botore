import React from 'react';
import { StableScreen } from '../../garage/screens/StableScreen';
import { useFirstRun } from '../FirstRunContext';

/**
 * Route slot: Stable — shell owns the route; F8 owns auth/stable/save domain UI.
 * Do not add shell routes here.
 */
export function StableSlot(): React.ReactElement {
  const { goTo } = useFirstRun();
  return (
    <StableScreen
      onCustomise={() => goTo('Customise')}
      onFindOpponent={() => goTo('Opponents')}
      onSettings={() => goTo('Settings')}
    />
  );
}
