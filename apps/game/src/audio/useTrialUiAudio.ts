/**
 * Trial UI-cue + menu-music API for screens.
 * Prefers the app-wide TrialAudioProvider session so menu music stays continuous;
 * falls back to a local session when no provider is mounted (unit tests).
 */
import { useCallback, useEffect, useRef } from 'react';
import { createExpoAvBackend } from './expoAvBackend';
import {
  createTrialAudioSession,
  type PlayCueOptions,
  type TrialAudioSession,
} from './TrialAudioSession';
import { TRIAL_AUDIO_METRO_SOURCES } from './trialAudioMetroAssets';
import type { TrialAudioUiCueId } from './trialAudioPin';
import { useSharedTrialAudio, type TrialAudioApi } from './TrialAudioProvider';

export type TrialUiAudioApi = {
  playUiTap: () => void;
  playCue: (id: TrialAudioUiCueId, options?: PlayCueOptions) => void;
  playSplashSting: () => void;
  playFaceOffSting: () => void;
  startMenuLoop: () => void;
  crossfadeToFight: (opts?: { durationMs?: number }) => void;
  crossfadeToMenu: (opts?: { durationMs?: number }) => void;
};

function toUiApi(api: TrialAudioApi): TrialUiAudioApi {
  return {
    playUiTap: api.playUiTap,
    playCue: api.playCue,
    playSplashSting: api.playSplashSting,
    playFaceOffSting: api.playFaceOffSting,
    startMenuLoop: api.startMenuLoop,
    crossfadeToFight: api.crossfadeToFight,
    crossfadeToMenu: api.crossfadeToMenu,
  };
}

export function useTrialUiAudio(opts: {
  muted: boolean;
  musicEnabled?: boolean;
  effectsEnabled?: boolean;
  enabled?: boolean;
}): TrialUiAudioApi {
  const shared = useSharedTrialAudio();
  const sessionRef = useRef<TrialAudioSession | null>(null);
  const mutedRef = useRef(opts.muted);
  const musicEnabledRef = useRef(opts.musicEnabled !== false);
  const effectsEnabledRef = useRef(opts.effectsEnabled !== false);
  mutedRef.current = opts.muted;
  musicEnabledRef.current = opts.musicEnabled !== false;
  effectsEnabledRef.current = opts.effectsEnabled !== false;
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (shared || !enabled) {
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
  }, [enabled, shared]);

  useEffect(() => {
    if (shared) return;
    sessionRef.current?.setMuted(opts.muted);
  }, [opts.muted, shared]);

  useEffect(() => {
    if (shared) return;
    sessionRef.current?.setMusicEnabled(opts.musicEnabled !== false);
  }, [opts.musicEnabled, shared]);

  useEffect(() => {
    if (shared) return;
    sessionRef.current?.setEffectsEnabled(opts.effectsEnabled !== false);
  }, [opts.effectsEnabled, shared]);

  const playUiTap = useCallback(() => {
    try {
      if (shared) {
        shared.playUiTap();
        return;
      }
      sessionRef.current?.playUiTap();
    } catch {
      // ignore
    }
  }, [shared]);

  const playCue = useCallback(
    (id: TrialAudioUiCueId, options?: PlayCueOptions) => {
      try {
        if (shared) {
          shared.playCue(id, options);
          return;
        }
        sessionRef.current?.playCue(id, options);
      } catch {
        // ignore
      }
    },
    [shared],
  );

  const playSplashSting = useCallback(() => {
    try {
      if (shared) {
        shared.playSplashSting();
        return;
      }
      sessionRef.current?.playSplashSting();
    } catch {
      // ignore
    }
  }, [shared]);

  const playFaceOffSting = useCallback(() => {
    try {
      if (shared) {
        shared.playFaceOffSting();
        return;
      }
      sessionRef.current?.playFaceOffSting();
    } catch {
      // ignore
    }
  }, [shared]);

  const startMenuLoop = useCallback(() => {
    try {
      if (shared) {
        shared.startMenuLoop();
        return;
      }
      sessionRef.current?.startMenuLoop();
    } catch {
      // ignore
    }
  }, [shared]);

  const crossfadeToFight = useCallback(
    (fadeOpts?: { durationMs?: number }) => {
      try {
        if (shared) {
          shared.crossfadeToFight(fadeOpts);
          return;
        }
        sessionRef.current?.crossfadeToFight(fadeOpts);
      } catch {
        // ignore
      }
    },
    [shared],
  );

  const crossfadeToMenu = useCallback(
    (fadeOpts?: { durationMs?: number }) => {
      try {
        if (shared) {
          shared.crossfadeToMenu(fadeOpts);
          return;
        }
        sessionRef.current?.crossfadeToMenu(fadeOpts);
      } catch {
        // ignore
      }
    },
    [shared],
  );

  if (shared) return toUiApi(shared);

  return {
    playUiTap,
    playCue,
    playSplashSting,
    playFaceOffSting,
    startMenuLoop,
    crossfadeToFight,
    crossfadeToMenu,
  };
}
