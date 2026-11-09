/**
 * Minimal audio backend contract for trial pack playback.
 * Implementations must never throw into the fight clock — callers still catch.
 */
export type AudioSource = number | { uri: string };

export type LoopHandle = {
  setMuted: (muted: boolean) => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
  stop: () => Promise<void>;
};

export type TrialAudioBackend = {
  /** Configure platform audio mode once. Failures are ignored by the session. */
  ensureMode: () => Promise<void>;
  /** Fire-and-forget one-shot. Resolves when playback is started (or skipped). */
  playOneShot: (source: AudioSource, opts: { volume: number; muted: boolean }) => Promise<void>;
  /** Start / replace a looping clip. Returns a handle for mute/pause/stop. */
  startLoop: (
    source: AudioSource,
    opts: { volume: number; muted: boolean },
  ) => Promise<LoopHandle | null>;
};

/** No-op backend — used when muted-only tests or when expo-av is unavailable. */
export function createNoopAudioBackend(): TrialAudioBackend {
  return {
    ensureMode: async () => undefined,
    playOneShot: async () => undefined,
    startLoop: async () => ({
      setMuted: async () => undefined,
      setPaused: async () => undefined,
      stop: async () => undefined,
    }),
  };
}
