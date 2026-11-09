/**
 * Fire-and-forget trial audio session for CanonicalReplayPlayer.
 * Never throws; never awaits on the fight clock.
 */
import type { AnimationCommand } from '../replay-playback';
import {
  sfxClipFromCommand,
  shouldStartMusicLoop,
  shouldStopMusicLoop,
} from './cueFromCommand';
import type { AudioSource, LoopHandle, TrialAudioBackend } from './audioBackend';
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
  /** Stop loop and allow hush/music to fire again on the next show_battle. */
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
  let modeEnsured = false;
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
      () => backend.playOneShot(source, { volume, muted }),
      () => {
        stats.failures += 1;
      },
    );
  };

  const startMusic = () => {
    if (disposed || musicStarted) return;
    musicStarted = true;
    const source = sources.musicLoop;
    if (source == null) {
      stats.failures += 1;
      return;
    }
    ensureMode();
    const volume = trialAudioClipVolume('musicLoop');
    safeRun(
      'musicLoop',
      async () => {
        const handle = await backend.startLoop(source, { volume, muted });
        if (disposed) {
          await handle?.stop();
          return;
        }
        music = handle;
        if (handle && !playing) {
          await handle.setPaused(true);
        }
      },
      () => {
        stats.failures += 1;
        musicStarted = false;
      },
    );
  };

  const stopMusic = () => {
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
      stopMusic();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stopMusic();
    },
  };
}
