/**
 * Bridges player settings into the shared TrialAudioProvider.
 * Mount once around GarageRootInner so splash → shell keeps one session.
 */
import React from 'react';
import { usePlayerSettings } from '../settings';
import { TrialAudioProvider } from './TrialAudioProvider';

export function GarageTrialAudioGate(props: { children: React.ReactNode }): React.ReactElement {
  const settings = usePlayerSettings();
  return (
    <TrialAudioProvider
      muted={settings.muted}
      musicEnabled={settings.musicEnabled}
      effectsEnabled={settings.effectsEnabled}
    >
      {props.children}
    </TrialAudioProvider>
  );
}
