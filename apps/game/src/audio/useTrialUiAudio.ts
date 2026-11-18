/**
 * Trial UI-cue + menu-music API for screens.
 * Prefers the app-wide TrialAudioProvider session so menu music stays continuous.
 * Without a provider (headless / unit tests), returns a silent no-op API so
 * importing this hook never loads Metro `.m4a` requires.
 */
import { useCallback, useMemo } from 'react';
import type { PlayCueOptions } from './TrialAudioSession';
import type { TrialAudioUiCueId } from './trialAudioPin';
import { useSharedTrialAudio, type TrialAudioApi } from './trialAudioContext';

export type TrialUiAudioApi = {
  playUiTap: () => void;
  playCue: (id: TrialAudioUiCueId, options?: PlayCueOptions) => void;
  playSplashSting: () => void;
  playFaceOffSting: () => void;
  startMenuLoop: () => void;
  crossfadeToFight: (opts?: { durationMs?: number }) => void;
  crossfadeToMenu: (opts?: { durationMs?: number }) => void;
};

const NOOP_UI_AUDIO: TrialUiAudioApi = {
  playUiTap: () => undefined,
  playCue: () => undefined,
  playSplashSting: () => undefined,
  playFaceOffSting: () => undefined,
  startMenuLoop: () => undefined,
  crossfadeToFight: () => undefined,
  crossfadeToMenu: () => undefined,
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

export function useTrialUiAudio(_opts: {
  muted: boolean;
  musicEnabled?: boolean;
  effectsEnabled?: boolean;
  enabled?: boolean;
}): TrialUiAudioApi {
  const shared = useSharedTrialAudio();
  const enabled = _opts.enabled !== false;

  const playUiTap = useCallback(() => {
    try {
      shared?.playUiTap();
    } catch {
      // ignore
    }
  }, [shared]);

  const playCue = useCallback(
    (id: TrialAudioUiCueId, options?: PlayCueOptions) => {
      try {
        shared?.playCue(id, options);
      } catch {
        // ignore
      }
    },
    [shared],
  );

  const playSplashSting = useCallback(() => {
    try {
      shared?.playSplashSting();
    } catch {
      // ignore
    }
  }, [shared]);

  const playFaceOffSting = useCallback(() => {
    try {
      shared?.playFaceOffSting();
    } catch {
      // ignore
    }
  }, [shared]);

  const startMenuLoop = useCallback(() => {
    try {
      shared?.startMenuLoop();
    } catch {
      // ignore
    }
  }, [shared]);

  const crossfadeToFight = useCallback(
    (fadeOpts?: { durationMs?: number }) => {
      try {
        shared?.crossfadeToFight(fadeOpts);
      } catch {
        // ignore
      }
    },
    [shared],
  );

  const crossfadeToMenu = useCallback(
    (fadeOpts?: { durationMs?: number }) => {
      try {
        shared?.crossfadeToMenu(fadeOpts);
      } catch {
        // ignore
      }
    },
    [shared],
  );

  return useMemo(() => {
    if (!enabled) return NOOP_UI_AUDIO;
    if (shared) return toUiApi(shared);
    // Headless / no provider: silent no-op (never require Metro assets).
    return {
      playUiTap,
      playCue,
      playSplashSting,
      playFaceOffSting,
      startMenuLoop,
      crossfadeToFight,
      crossfadeToMenu,
    };
  }, [
    enabled,
    shared,
    playUiTap,
    playCue,
    playSplashSting,
    playFaceOffSting,
    startMenuLoop,
    crossfadeToFight,
    crossfadeToMenu,
  ]);
}
