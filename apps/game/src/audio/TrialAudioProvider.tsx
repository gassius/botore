/**
 * App-wide trial audio session — one stack for menu music, UI SFX, and fight.
 * Mount near GarageRoot so splash can sting before FirstRunShell exists.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { createExpoAvBackend } from './expoAvBackend';
import {
  createTrialAudioSession,
  type PlayCueOptions,
  type TrialAudioSession,
} from './TrialAudioSession';
import { TRIAL_AUDIO_METRO_SOURCES } from './trialAudioMetroAssets';
import {
  TRIAL_AMBIENT_METRO_SOURCE,
  TRIAL_PART_AUDIO_METRO_SOURCES,
} from './trialPartAudioMetroAssets';
import type { TrialAudioUiCueId } from './trialAudioPin';
import type { FighterAudioProfile } from './partAudioResolve';

export type TrialAudioApi = {
  playUiTap: () => void;
  playCue: (id: TrialAudioUiCueId, options?: PlayCueOptions) => void;
  playSplashSting: () => void;
  playFaceOffSting: () => void;
  startMenuLoop: () => void;
  crossfadeToFight: (opts?: { durationMs?: number }) => void;
  crossfadeToMenu: (opts?: { durationMs?: number }) => void;
  setFighterProfiles: (profiles: readonly FighterAudioProfile[]) => void;
  notifyCommand: TrialAudioSession['notifyCommand'];
  setPlaying: (playing: boolean) => void;
  reset: () => void;
  /** Imperative session for rare call sites (tests / adapters). */
  getSession: () => TrialAudioSession | null;
};

const TrialAudioContext = createContext<TrialAudioApi | null>(null);

export function TrialAudioProvider(props: {
  muted: boolean;
  musicEnabled?: boolean;
  effectsEnabled?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const sessionRef = useRef<TrialAudioSession | null>(null);
  const mutedRef = useRef(props.muted);
  const musicEnabledRef = useRef(props.musicEnabled !== false);
  const effectsEnabledRef = useRef(props.effectsEnabled !== false);
  mutedRef.current = props.muted;
  musicEnabledRef.current = props.musicEnabled !== false;
  effectsEnabledRef.current = props.effectsEnabled !== false;

  useEffect(() => {
    const session = createTrialAudioSession({
      backend: createExpoAvBackend(),
      sources: TRIAL_AUDIO_METRO_SOURCES,
      partSources: TRIAL_PART_AUDIO_METRO_SOURCES,
      ambientSource: TRIAL_AMBIENT_METRO_SOURCE,
      muted: mutedRef.current,
      musicEnabled: musicEnabledRef.current,
      effectsEnabled: effectsEnabledRef.current,
      playing: true,
    });
    sessionRef.current = session;
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    sessionRef.current?.setMuted(props.muted);
  }, [props.muted]);

  useEffect(() => {
    sessionRef.current?.setMusicEnabled(props.musicEnabled !== false);
  }, [props.musicEnabled]);

  useEffect(() => {
    sessionRef.current?.setEffectsEnabled(props.effectsEnabled !== false);
  }, [props.effectsEnabled]);

  const safe = useCallback((fn: (s: TrialAudioSession) => void) => {
    try {
      const s = sessionRef.current;
      if (s) fn(s);
    } catch {
      // never block UI
    }
  }, []);

  const api = useMemo<TrialAudioApi>(
    () => ({
      playUiTap: () => safe((s) => s.playUiTap()),
      playCue: (id, options) => safe((s) => s.playCue(id, options)),
      playSplashSting: () => safe((s) => s.playSplashSting()),
      playFaceOffSting: () => safe((s) => s.playFaceOffSting()),
      startMenuLoop: () => safe((s) => s.startMenuLoop()),
      crossfadeToFight: (opts) => safe((s) => s.crossfadeToFight(opts)),
      crossfadeToMenu: (opts) => safe((s) => s.crossfadeToMenu(opts)),
      setFighterProfiles: (profiles) => safe((s) => s.setFighterProfiles(profiles)),
      notifyCommand: (cmd) => safe((s) => s.notifyCommand(cmd)),
      setPlaying: (playing) => safe((s) => s.setPlaying(playing)),
      reset: () => safe((s) => s.reset()),
      getSession: () => sessionRef.current,
    }),
    [safe],
  );

  return <TrialAudioContext.Provider value={api}>{props.children}</TrialAudioContext.Provider>;
}

export function useSharedTrialAudio(): TrialAudioApi | null {
  return useContext(TrialAudioContext);
}
