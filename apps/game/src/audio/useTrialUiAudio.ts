/**
 * Lightweight trial UI-cue session for Result / Customise (D2/D3).
 * Same mute / Effects channel rules as fight replay; no combat command mapping.
 */
import { useCallback, useEffect, useRef } from 'react';
import { createExpoAvBackend } from './expoAvBackend';
import { createTrialAudioSession, type TrialAudioSession } from './TrialAudioSession';
import { TRIAL_AUDIO_METRO_SOURCES } from './trialAudioMetroAssets';
import type { TrialAudioUiCueId } from './trialAudioPin';

export type TrialUiAudioApi = {
  playUiTap: () => void;
  playCue: (id: TrialAudioUiCueId) => void;
};

export function useTrialUiAudio(opts: {
  muted: boolean;
  musicEnabled?: boolean;
  effectsEnabled?: boolean;
  enabled?: boolean;
}): TrialUiAudioApi {
  const sessionRef = useRef<TrialAudioSession | null>(null);
  const mutedRef = useRef(opts.muted);
  const musicEnabledRef = useRef(opts.musicEnabled !== false);
  const effectsEnabledRef = useRef(opts.effectsEnabled !== false);
  mutedRef.current = opts.muted;
  musicEnabledRef.current = opts.musicEnabled !== false;
  effectsEnabledRef.current = opts.effectsEnabled !== false;
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
      playing: true,
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

  const playUiTap = useCallback(() => {
    try {
      sessionRef.current?.playUiTap();
    } catch {
      // ignore
    }
  }, []);

  const playCue = useCallback((id: TrialAudioUiCueId) => {
    try {
      sessionRef.current?.playCue(id);
    } catch {
      // ignore
    }
  }, []);

  return { playUiTap, playCue };
}
