import React from 'react';
import { CustomiseScreen } from '../../garage/screens/CustomiseScreen';
import { useFirstRun } from '../FirstRunContext';

/**
 * Route slot: Customise — shell owns the route; F8 owns pending vs confirmed + save.
 */
export function CustomiseSlot(): React.ReactElement {
  const { goBack, goTo } = useFirstRun();
  return <CustomiseScreen onBack={goBack} onSaved={() => goTo('Stable')} />;
}
