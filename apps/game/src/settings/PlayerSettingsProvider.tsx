/**
 * Single live source for mute / Music / Effects / reduced-motion.
 * Mount above GarageTrialAudioGate and FirstRunProvider so both share one copy.
 */
import React, { createContext, useContext } from 'react';
import { usePlayerSettingsState, type PlayerSettingsControls } from './usePlayerSettings';

const PlayerSettingsContext = createContext<PlayerSettingsControls | null>(null);

export function PlayerSettingsProvider(props: { children: React.ReactNode }): React.ReactElement {
  const settings = usePlayerSettingsState();
  return (
    <PlayerSettingsContext.Provider value={settings}>
      {props.children}
    </PlayerSettingsContext.Provider>
  );
}

/** Shared player settings — must be under {@link PlayerSettingsProvider}. */
export function usePlayerSettings(): PlayerSettingsControls {
  const ctx = useContext(PlayerSettingsContext);
  if (!ctx) {
    throw new Error('usePlayerSettings must be used within PlayerSettingsProvider');
  }
  return ctx;
}
