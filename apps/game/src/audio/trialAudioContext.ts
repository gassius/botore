/**
 * Headless-safe shared trial-audio context (no Metro `.m4a` requires).
 * The runtime provider that creates the session lives in TrialAudioProvider.tsx.
 */
import { createContext, useContext } from 'react';
import type { AnimationCommand } from '../replay-playback';
import type { PlayCueOptions, TrialAudioSession } from './TrialAudioSession';
import type { FighterAudioProfile } from './partAudioResolve';
import type { TrialAudioUiCueId } from './trialAudioPin';

export type TrialAudioApi = {
  playUiTap: () => void;
  playCue: (id: TrialAudioUiCueId, options?: PlayCueOptions) => void;
  playSplashSting: () => void;
  playFaceOffSting: () => void;
  startMenuLoop: () => void;
  crossfadeToFight: (opts?: { durationMs?: number }) => void;
  crossfadeToMenu: (opts?: { durationMs?: number }) => void;
  setFighterProfiles: (profiles: readonly FighterAudioProfile[]) => void;
  notifyCommand: (cmd: AnimationCommand) => void;
  setPlaying: (playing: boolean) => void;
  reset: () => void;
  /** Imperative session for rare call sites (tests / adapters). */
  getSession: () => TrialAudioSession | null;
};

export const TrialAudioContext = createContext<TrialAudioApi | null>(null);

export function useSharedTrialAudio(): TrialAudioApi | null {
  return useContext(TrialAudioContext);
}
