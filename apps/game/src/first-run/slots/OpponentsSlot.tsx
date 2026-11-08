import React from 'react';
import { OpponentsScreen } from '../../fight/screens/OpponentsScreen';
import { useFirstRun } from '../FirstRunContext';

/** Route slot: Opponents — F9 owns eligibility + fight request. */
export function OpponentsSlot(): React.ReactElement {
  const { goBack, goNext } = useFirstRun();
  return <OpponentsScreen onBack={goBack} onContinue={goNext} />;
}
