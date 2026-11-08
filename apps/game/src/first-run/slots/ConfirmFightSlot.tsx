import React from 'react';
import { ConfirmFightScreen } from '../../fight/screens/ConfirmFightScreen';
import { useFirstRun } from '../FirstRunContext';

/** Route slot: ConfirmFight — F9 owns cost + start request via combat-v1. */
export function ConfirmFightSlot(): React.ReactElement {
  const { goBack, goNext } = useFirstRun();
  return (
    <ConfirmFightScreen
      onBack={goBack}
      onFightStarted={() => {
        goNext();
      }}
    />
  );
}
