/**
 * expo-av backend for trial audio. UI/runtime only — keep out of headless unit
 * paths that do not import this module.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { AudioSource, LoopHandle, TrialAudioBackend } from './audioBackend';

type SoundLike = {
  playAsync: () => Promise<unknown>;
  stopAsync: () => Promise<unknown>;
  unloadAsync: () => Promise<unknown>;
  setIsMutedAsync: (muted: boolean) => Promise<unknown>;
  setStatusAsync: (status: Record<string, unknown>) => Promise<unknown>;
  setOnPlaybackStatusUpdate: (cb: ((status: { didJustFinish?: boolean }) => void) | null) => void;
};

type ExpoAvModule = {
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

export function createExpoAvBackend(): TrialAudioBackend {
  const mod = loadExpoAv();
  if (!mod?.Audio?.Sound?.createAsync) {
    return {
      ensureMode: async () => undefined,
      playOneShot: async () => undefined,
      startLoop: async () => null,
    };
  }
  const { Audio } = mod;
  let modeReady = false;

  return {
    ensureMode: async () => {
      if (modeReady) return;
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        modeReady = true;
      } catch {
        // Ignore — fight must continue.
      }
    },

    playOneShot: async (source, opts) => {
      if (opts.muted) return;
      try {
        const { sound } = await Audio.Sound.createAsync(source, {
          shouldPlay: true,
          volume: opts.volume,
          isMuted: false,
          isLooping: false,
        });
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status?.didJustFinish) {
            void sound.unloadAsync().catch(() => undefined);
          }
        });
      } catch {
        // Missing / decode failure — continue fight silently.
      }
    },

    startLoop: async (source, opts) => {
      let sound: SoundLike | null = null;
      try {
        const created = await Audio.Sound.createAsync(source, {
          shouldPlay: !opts.muted,
          volume: opts.volume,
          isMuted: opts.muted,
          isLooping: true,
        });
        sound = created.sound;
      } catch {
        return null;
      }

      const handle: LoopHandle = {
        setMuted: async (muted) => {
          if (!sound) return;
          try {
            await sound.setIsMutedAsync(muted);
            if (!muted) await sound.playAsync();
          } catch {
            // ignore
          }
        },
        setPaused: async (paused) => {
          if (!sound) return;
          try {
            if (paused) {
              await sound.setStatusAsync({ shouldPlay: false });
            } else {
              await sound.playAsync();
            }
          } catch {
            // ignore
          }
        },
        stop: async () => {
          if (!sound) return;
          const s = sound;
          sound = null;
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
      return handle;
    },
  };
}
