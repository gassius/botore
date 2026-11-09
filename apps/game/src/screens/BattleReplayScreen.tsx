/**
 * Legacy entry kept as a thin alias to the shell Replay slot screen.
 * Prefer importing ReplaySlotScreen from screens/ for shell mounts.
 */
import React from 'react';
import { ReplaySlotScreen } from './ReplaySlotScreen';

export const BattleReplayScreen: React.FC = () => {
  return <ReplaySlotScreen />;
};
