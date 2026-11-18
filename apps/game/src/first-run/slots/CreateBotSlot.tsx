import React from 'react';
import { CreateBotScreen } from '../../garage/screens/CreateBotScreen';
import { useFirstRun } from '../FirstRunContext';

/** D6 Create Bot route slot — reached from the Ludus Create Bot carousel card. */
export function CreateBotSlot(): React.ReactElement {
  const { goTo } = useFirstRun();
  return <CreateBotScreen onBack={() => goTo('Stable')} onCreated={() => goTo('Stable')} />;
}
