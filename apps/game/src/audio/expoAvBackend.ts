/**
 * expo-av backend for trial audio. UI/runtime only — keep out of headless unit
 * paths that do not import this module.
 *
 * Platform policy (Sound FX & Music Guidelines): obey iOS silent switch; pause
 * on interruptions (do not duck through them).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { AudioSource, LoopHandle, OneShotHandle, TrialAudioBackend } from './audioBackend';

/** expo-av InterruptionModeIOS / Android DoNotMix = 1 */
export const TRIAL_AUDIO_INTERRUPTION_DO_NOT_MIX = 1 as const;

/** Assertable mode payload for guidelines-aligned silent switch + pause-on-interrupt. */
export const TRIAL_AUDIO_PLATFORM_MODE = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: false,
  staysActiveInBackground: false,
  shouldDuckAndroid: false,
  playThroughEarpieceAndroid: false,
  interruptionModeIOS: TRIAL_AUDIO_INTERRUPTION_DO_NOT_MIX,
  interruptionModeAndroid: TRIAL_AUDIO_INTERRUPTION_DO_NOT_MIX,
} as const;

type SoundLike = {
  playAsync: () => Promise<unknown>;
  stopAsync: () => Promise<unknown>;
  unloadAsync: () => Promise<unknown>;
  setIsMutedAsync: (muted: boolean) => Promise<unknown>;
  setStatusAsync: (status: Record<string, unknown>) => Promise<unknown>;
  setOnPlaybackStatusUpdate: (cb: ((status: { didJustFinish?: boolean }) => void) | null) => void;
};

export type ExpoAvModule = {
  Audio: {
    setAudioModeAsync: (mode: Record<string, unknown>) => Promise<void>;
    Sound: {
      createAsync: (
        source: AudioSource,
        initialStatus?: Record<string, unknown>,
      ) => Promise<{ sound: SoundLike }>;
    };
  };
};

function loadExpoAv(): ExpoAvModule | null {
  try {
    // Soft dependency: missing / broken native module → silent noop path.
    return require('expo-av') as ExpoAvModule;
  } catch {
    return null;
  }
}

function wrapOneShot(sound: SoundLike): OneShotHandle {
  let alive = true;
  const handle: OneShotHandle = {
    setMuted: async (muted) => {
      if (!alive) return;
      try {
        await sound.setIsMutedAsync(muted);
      } catch {
        // ignore
      }
    },
    play: async () => {
      if (!alive) return;
      try {
        await sound.playAsync();
      } catch {
        // ignore
      }
    },
    stop: async () => {
      if (!alive) return;
      alive = false;
      try {
        sound.setOnPlaybackStatusUpdate(null);
      } catch {
        // ignore
      }
      try {
        await sound.stopAsync();
      } catch {
        // ignore
      }
      try {
        await sound.unloadAsync();
      } catch {
        // ignore
      }
    },
  };
  sound.setOnPlaybackStatusUpdate((status) => {
    if (status?.didJustFinish) {
      void handle.stop();
    }
  });
  return handle;
}

function wrapLoop(sound: SoundLike): LoopHandle {
  let alive: SoundLike | null = sound;
  return {
    setMuted: async (muted) => {
      if (!alive) return;
      try {
        // Mute only — do not resume a paused loop (pause stays independent).
        await alive.setIsMutedAsync(muted);
      } catch {
        // ignore
      }
    },
    setPaused: async (paused) => {
      if (!alive) return;
      try {
        if (paused) {
          await alive.setStatusAsync({ shouldPlay: false });
        } else {
          await alive.playAsync();
        }
      } catch {
        // ignore
      }
    },
    stop: async () => {
      if (!alive) return;
      const s = alive;
      alive = null;
      try {
        await s.stopAsync();
      } catch {
        // ignore
      }
      try {
        await s.unloadAsync();
      } catch {
        // ignore
      }
    },
  };
}

export type ExpoAvBackendOptions = {
  /** Injected module for unit tests; defaults to require('expo-av'). */
  readonly audioModule?: ExpoAvModule | null;
};

export function createExpoAvBackend(options: ExpoAvBackendOptions = {}): TrialAudioBackend {
  const mod = options.audioModule !== undefined ? options.audioModule : loadExpoAv();
  if (!mod?.Audio?.Sound?.createAsync) {
    return {
      ensureMode: async () => undefined,
      playOneShot: async () => null,
      startLoop: async () => null,
    };
  }
  const { Audio } = mod;
  let modeReady = false;

  return {
    ensureMode: async () => {
      if (modeReady) return;
      try {
        await Audio.setAudioModeAsync({ ...TRIAL_AUDIO_PLATFORM_MODE });
        modeReady = true;
      } catch {
        // Ignore — fight must continue.
      }
    },

    playOneShot: async (source, opts) => {
      try {
        const { sound } = await Audio.Sound.createAsync(source, {
          shouldPlay: false,
          volume: opts.volume,
          isMuted: opts.muted,
          isLooping: false,
        });
        return wrapOneShot(sound);
      } catch {
        return null;
      }
    },

    startLoop: async (source, opts) => {
      try {
        const { sound } = await Audio.Sound.createAsync(source, {
          shouldPlay: false,
          volume: opts.volume,
          isMuted: false,
          isLooping: true,
        });
        return wrapLoop(sound);
      } catch {
        return null;
      }
    },
  };
}
