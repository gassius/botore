/**
 * Hook that binds a TrialAudioSession to CanonicalReplayPlayer lifecycle.
 * Failures never surface to the fight clock.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { AnimationCommand } from '../replay-playback';
import { createExpoAvBackend } from './expoAvBackend';
import { createTrialAudioSession, type TrialAudioSession } from './TrialAudioSession';
import { TRIAL_AUDIO_METRO_SOURCES } from './trialAudioMetroAssets';

export type TrialReplayAudioApi = {
  onCommand: (cmd: AnimationCommand) => void;
  playUiTap: () => void;
  reset: () => void;
};

export function useTrialReplayAudio(opts: {
  muted: boolean;
  musicEnabled?: boolean;
  effectsEnabled?: boolean;
  playing: boolean;
  enabled?: boolean;
}): TrialReplayAudioApi {
  const sessionRef = useRef<TrialAudioSession | null>(null);
  const mutedRef = useRef(opts.muted);
  const musicEnabledRef = useRef(opts.musicEnabled !== false);
  const effectsEnabledRef = useRef(opts.effectsEnabled !== false);
  const playingRef = useRef(opts.playing);
  mutedRef.current = opts.muted;
  musicEnabledRef.current = opts.musicEnabled !== false;
  effectsEnabledRef.current = opts.effectsEnabled !== false;
  playingRef.current = opts.playing;
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled) {
      sessionRef.current = null;
      return;
    }
    const session = createTrialAudioSession({
      backend: createExpoAvBackend(),
      sources: TRIAL_AUDIO_METRO_SOURCES,
      muted: mutedRef.current,
      musicEnabled: musicEnabledRef.current,
      effectsEnabled: effectsEnabledRef.current,
      playing: playingRef.current,
    });
    sessionRef.current = session;
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    sessionRef.current?.setMuted(opts.muted);
  }, [opts.muted]);

  useEffect(() => {
    sessionRef.current?.setMusicEnabled(opts.musicEnabled !== false);
  }, [opts.musicEnabled]);

  useEffect(() => {
    sessionRef.current?.setEffectsEnabled(opts.effectsEnabled !== false);
  }, [opts.effectsEnabled]);

  useEffect(() => {
    sessionRef.current?.setPlaying(opts.playing);
  }, [opts.playing]);

  const onCommand = useCallback((cmd: AnimationCommand) => {
    try {
      sessionRef.current?.notifyCommand(cmd);
    } catch {
      // Never desync fight on audio errors.
    }
  }, []);

  const playUiTap = useCallback(() => {
    try {
      sessionRef.current?.playUiTap();
    } catch {
      // ignore
    }
  }, []);

  const reset = useCallback(() => {
    try {
      sessionRef.current?.reset();
    } catch {
      // ignore
    }
  }, []);

  return { onCommand, playUiTap, reset };
}
