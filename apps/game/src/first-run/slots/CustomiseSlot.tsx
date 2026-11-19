import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { CustomiseScreen } from '../../garage/screens/CustomiseScreen';
import { useFirstRun } from '../FirstRunContext';

/**
 * Route slot: Customise — shell owns the route; F8 owns pending vs confirmed + save.
 * D3: stay on Customise after EQUIP so the Equipped flash is visible (design captures).
 * Side-entry from Ludus — chrome + Android hardware Back → Ludus (not Opponents).
 */
export function CustomiseSlot(): React.ReactElement {
  const { goBack } = useFirstRun();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  return <CustomiseScreen onBack={goBack} />;
}
