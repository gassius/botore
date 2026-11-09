/**
 * Minimal audio backend contract for trial pack playback.
 * Implementations must never throw into the fight clock — callers still catch.
 */
export type AudioSource = number | { uri: string };

export type OneShotHandle = {
  setMuted: (muted: boolean) => Promise<void>;
  play: () => Promise<void>;
  stop: () => Promise<void>;
};

export type LoopHandle = {
  setMuted: (muted: boolean) => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
  stop: () => Promise<void>;
};

export type TrialAudioBackend = {
  /** Configure platform audio mode once. Failures are ignored by the session. */
  ensureMode: () => Promise<void>;
  /**
   * Create a one-shot without auto-starting. Session owns the handle, reconciles
   * mute/dispose, then play() — never await this on the fight clock.
   */
  playOneShot: (
    source: AudioSource,
    opts: { volume: number; muted: boolean },
  ) => Promise<OneShotHandle | null>;
  /**
   * Create a looping clip paused. Session reconciles mute/play after await and
   * invalidates stale generations on reset/end/dispose.
   */
  startLoop: (source: AudioSource, opts: { volume: number }) => Promise<LoopHandle | null>;
};

/** No-op backend — used when muted-only tests or when expo-av is unavailable. */
export function createNoopAudioBackend(): TrialAudioBackend {
  return {
    ensureMode: async () => undefined,
    playOneShot: async () => ({
      setMuted: async () => undefined,
      play: async () => undefined,
      stop: async () => undefined,
    }),
    startLoop: async () => ({
      setMuted: async () => undefined,
      setPaused: async () => undefined,
      stop: async () => undefined,
    }),
  };
}
