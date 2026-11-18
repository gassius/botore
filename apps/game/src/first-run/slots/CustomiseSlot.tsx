import React from 'react';
import { CustomiseScreen } from '../../garage/screens/CustomiseScreen';
import { useFirstRun } from '../FirstRunContext';

/**
 * Route slot: Customise — shell owns the route; F8 owns pending vs confirmed + save.
 * D3: stay on Customise after EQUIP so the Equipped flash is visible (design captures).
 */
export function CustomiseSlot(): React.ReactElement {
  const { goBack } = useFirstRun();
  return <CustomiseScreen onBack={goBack} />;
}
