import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { OpponentsScreen } from '../../fight/screens/OpponentsScreen';
import { useFirstRun } from '../FirstRunContext';

/**
 * Route slot: Opponents — F9 owns eligibility + fight request.
 * Opened from Ludus Find opponent; chrome + Android hardware Back → Ludus.
 */
export function OpponentsSlot(): React.ReactElement {
  const { goBack, goNext } = useFirstRun();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  return <OpponentsScreen onBack={goBack} onContinue={goNext} />;
}
