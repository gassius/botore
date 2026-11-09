import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDesignCaptureDeepLink } from '../design-capture';
import { FirstRunProvider, useFirstRun } from './FirstRunContext';
import type { FirstRunRoute } from './routes';
import { StableSlot } from './slots/StableSlot';
import { CustomiseSlot } from './slots/CustomiseSlot';
import { OpponentsSlot } from './slots/OpponentsSlot';
import { ConfirmFightSlot } from './slots/ConfirmFightSlot';
import { ReplaySlot } from './slots/ReplaySlot';
import { FightResultSlot } from './slots/FightResultSlot';
import { RankingSlot } from './slots/RankingSlot';

function RouteSlot({ route }: { route: FirstRunRoute }): React.ReactElement {
  switch (route) {
    case 'Stable':
      return <StableSlot />;
    case 'Customise':
      return <CustomiseSlot />;
    case 'Opponents':
      return <OpponentsSlot />;
    case 'ConfirmFight':
      return <ConfirmFightSlot />;
    case 'Replay':
      return <ReplaySlot />;
    case 'FightResult':
      return <FightResultSlot />;
    case 'Ranking':
      return <RankingSlot />;
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}

function ShellInner(): React.ReactElement {
  const { route } = useFirstRun();
  useDesignCaptureDeepLink();
  return (
    <>
      <StatusBar style="light" />
      <RouteSlot route={route} />
    </>
  );
}

/** First-run native navigation shell + Garage Tag chrome (ticket 1amjtrey0ew). */
export function FirstRunShell(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <FirstRunProvider>
        <ShellInner />
      </FirstRunProvider>
    </SafeAreaProvider>
  );
}
