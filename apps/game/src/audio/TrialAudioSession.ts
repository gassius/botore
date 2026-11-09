/**
 * Fire-and-forget trial audio session for CanonicalReplayPlayer.
 * Never throws; never awaits on the fight clock.
 *
 * Music starts use a generation token invalidated by reset / victory stop /
 * dispose so deferred startLoop completions cannot leak or revive audio.
 * One-shots are owned until natural end, mute, reset, or dispose.
 */
import type { AnimationCommand } from '../replay-playback';
import { sfxClipFromCommand, shouldStartMusicLoop, shouldStopMusicLoop } from './cueFromCommand';
import type { AudioSource, LoopHandle, OneShotHandle, TrialAudioBackend } from './audioBackend';
import { createNoopAudioBackend } from './audioBackend';
import { trialAudioClipVolume } from './trialAudioManifest';
import type { TrialAudioClipId } from './trialAudioPin';

export type TrialAudioSources = Readonly<Record<TrialAudioClipId, AudioSource | null>>;

export type TrialAudioSessionOptions = {
  readonly backend?: TrialAudioBackend;
  readonly sources: TrialAudioSources;
  readonly muted?: boolean;
  readonly playing?: boolean;
};

export type TrialAudioSession = {
  notifyCommand: (cmd: AnimationCommand) => void;
  playUiTap: () => void;
  setMuted: (muted: boolean) => void;
  setPlaying: (playing: boolean) => void;
  /** Stop loop + owned one-shots; allow hush/music again on the next show_battle. */
  reset: () => void;
  dispose: () => void;
  /** Test/diag — number of cue attempts (including muted skips). */
  readonly stats: { readonly cues: number; readonly failures: number };
};

function safeRun(label: string, fn: () => Promise<void>, onFail: () => void): void {
  try {
    void fn().catch(() => {
      onFail();
    });
  } catch {
    onFail();
    void label;
  }
}

export function createTrialAudioSession(opts: TrialAudioSessionOptions): TrialAudioSession {
  const backend = opts.backend ?? createNoopAudioBackend();
  const sources = opts.sources;
  let muted = Boolean(opts.muted);
  let playing = opts.playing !== false;
  let disposed = false;
  let music: LoopHandle | null = null;
  let musicStarted = false;
  /** Bumped on stopMusic / reset / dispose — invalidates in-flight startLoop. */
  let musicGeneration = 0;
  let modeEnsured = false;
  const oneshots = new Set<OneShotHandle>();
  const stats = { cues: 0, failures: 0 };

  const ensureMode = () => {
    if (modeEnsured || disposed) return;
    modeEnsured = true;
    safeRun(
      'mode',
      () => backend.ensureMode(),
      () => {
        stats.failures += 1;
      },
    );
  };

  const forgetOneShot = (handle: OneShotHandle) => {
    oneshots.delete(handle);
  };

  const stopOwnedOneShots = () => {
    const pending = [...oneshots];
    oneshots.clear();
    for (const handle of pending) {
      safeRun(
        'stopOneShot',
        () => handle.stop(),
        () => {
          stats.failures += 1;
        },
      );
    }
  };

  const playClip = (id: TrialAudioClipId) => {
    if (disposed) return;
    stats.cues += 1;
    if (muted && id !== 'musicLoop') return;
    const source = sources[id];
    if (source == null) {
      stats.failures += 1;
      return;
    }
    ensureMode();
    const volume = trialAudioClipVolume(id);
    safeRun(
      id,
      async () => {
        const handle = await backend.playOneShot(source, { volume, muted });
        if (!handle) {
          stats.failures += 1;
          return;
        }
        if (disposed) {
          await handle.stop();
          return;
        }
        oneshots.add(handle);
        try {
          await handle.setMuted(muted);
          if (disposed) {
            await handle.stop();
            forgetOneShot(handle);
            return;
          }
          if (!muted) {
            await handle.play();
          }
        } catch {
          stats.failures += 1;
          await handle.stop().catch(() => undefined);
          forgetOneShot(handle);
        }
      },
      () => {
        stats.failures += 1;
      },
    );
  };

  const reconcileMusic = async (handle: LoopHandle) => {
    await handle.setMuted(muted);
    await handle.setPaused(!playing);
  };

  const startMusic = () => {
    if (disposed || musicStarted) return;
    musicStarted = true;
    const generation = musicGeneration;
    const source = sources.musicLoop;
    if (source == null) {
      stats.failures += 1;
      musicStarted = false;
      return;
    }
    ensureMode();
    const volume = trialAudioClipVolume('musicLoop');
    safeRun(
      'musicLoop',
      async () => {
        const handle = await backend.startLoop(source, { volume });
        if (!handle) {
          if (generation === musicGeneration) musicStarted = false;
          stats.failures += 1;
          return;
        }
        // Stale after reset / victory / dispose — never adopt or leave playing.
        if (disposed || generation !== musicGeneration) {
          await handle.stop();
          return;
        }
        music = handle;
        try {
          await reconcileMusic(handle);
        } catch {
          stats.failures += 1;
        }
        // Re-check after reconcile awaits — another stop may have raced.
        if (disposed || generation !== musicGeneration) {
          if (music === handle) music = null;
          await handle.stop();
        }
      },
      () => {
        stats.failures += 1;
        if (generation === musicGeneration) musicStarted = false;
      },
    );
  };

  const stopMusic = () => {
    musicGeneration += 1;
    const handle = music;
    music = null;
    musicStarted = false;
    if (!handle) return;
    safeRun(
      'stopMusic',
      () => handle.stop(),
      () => {
        stats.failures += 1;
      },
    );
  };

  return {
    stats,
    notifyCommand: (cmd) => {
      if (disposed) return;
      const sfx = sfxClipFromCommand(cmd);
      if (sfx) playClip(sfx);
      if (shouldStartMusicLoop(cmd)) startMusic();
      if (shouldStopMusicLoop(cmd)) stopMusic();
    },
    playUiTap: () => {
      playClip('uiTap');
    },
    setMuted: (next) => {
      muted = Boolean(next);
      for (const handle of oneshots) {
        safeRun(
          'oneshotMuted',
          () => handle.setMuted(muted),
          () => {
            stats.failures += 1;
          },
        );
      }
      const handle = music;
      if (!handle) return;
      safeRun(
        'setMuted',
        () => handle.setMuted(muted),
        () => {
          stats.failures += 1;
        },
      );
    },
    setPlaying: (next) => {
      playing = Boolean(next);
      const handle = music;
      if (!handle) return;
      safeRun(
        'setPlaying',
        () => handle.setPaused(!playing),
        () => {
          stats.failures += 1;
        },
      );
    },
    reset: () => {
      if (disposed) return;
      stopOwnedOneShots();
      stopMusic();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stopOwnedOneShots();
      stopMusic();
    },
  };
}
