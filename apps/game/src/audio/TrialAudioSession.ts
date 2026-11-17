/**
 * Fire-and-forget trial audio session for CanonicalReplayPlayer.
 * Never throws; never awaits on the fight clock.
 *
 * Music + arena ambient start use a generation token invalidated by reset /
 * victory stop / dispose so deferred startLoop completions cannot leak or
 * revive audio. One-shots are owned until natural end, mute, reset, or dispose.
 *
 * Part swings / chassis hits prefer equipped sound tags when sources exist;
 * otherwise fall back to base trial clips.
 */
import type { AnimationCommand } from '../replay-playback';
import { shouldStartMusicLoop, shouldStopMusicLoop } from './cueFromCommand';
import type { AudioSource, LoopHandle, OneShotHandle, TrialAudioBackend } from './audioBackend';
import { createNoopAudioBackend } from './audioBackend';
import { trialAudioClipVolume } from './trialAudioManifest';
import type { TrialAudioClipId, TrialAudioUiCueId } from './trialAudioPin';
import {
  ARENA_AMBIENT_VOLUME,
  resolveOneShotCue,
  shouldStartAmbientLoop,
  shouldStopAmbientLoop,
  type FighterAudioProfile,
  type PartAudioCueId,
} from './partAudioResolve';

export type TrialAudioSources = Readonly<Record<TrialAudioClipId, AudioSource | null>>;

export type TrialPartAudioSources = Readonly<Partial<Record<PartAudioCueId, AudioSource | null>>>;

export type TrialAudioSessionOptions = {
  readonly backend?: TrialAudioBackend;
  readonly sources: TrialAudioSources;
  /** Optional equipped-part oneshots (weapon swing / chassis hit). */
  readonly partSources?: TrialPartAudioSources;
  /** Optional arena ambient loop (Music channel). */
  readonly ambientSource?: AudioSource | null;
  /** Character → equipped sound profile for part cue lookup. */
  readonly fighterProfiles?: readonly FighterAudioProfile[];
  /** Master mute — silences music + effects. */
  readonly muted?: boolean;
  /** Independent music channel (default true). Master mute still wins. */
  readonly musicEnabled?: boolean;
  /** Independent effects/SFX channel (default true). Master mute still wins. */
  readonly effectsEnabled?: boolean;
  readonly playing?: boolean;
};

export type TrialAudioSession = {
  notifyCommand: (cmd: AnimationCommand) => void;
  playUiTap: () => void;
  /** Result overlay / Customise one-shots (new record, XP tick, equip, card select). Fire-and-forget. */
  playCue: (id: TrialAudioUiCueId) => void;
  setMuted: (muted: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setEffectsEnabled: (enabled: boolean) => void;
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
  const partSources = opts.partSources ?? {};
  const ambientSource = opts.ambientSource ?? null;
  const fighterProfiles = opts.fighterProfiles ?? [];
  let muted = Boolean(opts.muted);
  let musicEnabled = opts.musicEnabled !== false;
  let effectsEnabled = opts.effectsEnabled !== false;
  let playing = opts.playing !== false;
  let disposed = false;
  let music: LoopHandle | null = null;
  let musicStarted = false;
  /** Bumped on stopMusic / reset / dispose — invalidates in-flight startLoop. */
  let musicGeneration = 0;
  let ambient: LoopHandle | null = null;
  let ambientStarted = false;
  let ambientGeneration = 0;
  let modeEnsured = false;
  const oneshots = new Set<OneShotHandle>();
  const stats = { cues: 0, failures: 0 };

  const musicChannelMuted = () => muted || !musicEnabled;
  const effectsChannelMuted = () => muted || !effectsEnabled;

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

  const playSource = (label: string, source: AudioSource | null | undefined, volume: number) => {
    if (disposed) return;
    stats.cues += 1;
    if (effectsChannelMuted()) return;
    if (source == null) {
      stats.failures += 1;
      return;
    }
    ensureMode();
    const channelMuted = effectsChannelMuted();
    safeRun(
      label,
      async () => {
        const handle = await backend.playOneShot(source, { volume, muted: channelMuted });
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
          await handle.setMuted(effectsChannelMuted());
          if (disposed) {
            await handle.stop();
            forgetOneShot(handle);
            return;
          }
          if (!effectsChannelMuted()) {
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

  const playClip = (id: TrialAudioClipId) => {
    playSource(id, sources[id], trialAudioClipVolume(id));
  };

  const playResolved = (cmd: AnimationCommand) => {
    const cue = resolveOneShotCue(cmd, fighterProfiles);
    if (!cue) return;
    if (cue.kind === 'part') {
      const partSource = partSources[cue.id];
      if (partSource != null) {
        // Part clips ship at unity gain; match base swing/hit volume from the trial manifest.
        const volume =
          cue.id === 'chassisBasicHit'
            ? trialAudioClipVolume('hit')
            : trialAudioClipVolume('swing');
        playSource(cue.id, partSource, volume);
        return;
      }
      // Missing part source → base fallback (never block).
      playClip(cue.id === 'chassisBasicHit' ? 'hit' : 'swing');
      return;
    }
    playClip(cue.id);
  };

  const reconcileMusic = async (handle: LoopHandle) => {
    await handle.setMuted(musicChannelMuted());
    await handle.setPaused(!playing);
  };

  const startMusic = () => {
    if (disposed || musicStarted) return;
    // Still create the loop handle when channel-muted so unmute can resume
    // without waiting for another show_battle — but never audible while muted.
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

  const startAmbient = () => {
    if (disposed || ambientStarted) return;
    ambientStarted = true;
    const generation = ambientGeneration;
    if (ambientSource == null) {
      // Ambient is optional — missing source is not a failure for the fight clock.
      ambientStarted = false;
      return;
    }
    ensureMode();
    safeRun(
      'ambient',
      async () => {
        const handle = await backend.startLoop(ambientSource, { volume: ARENA_AMBIENT_VOLUME });
        if (!handle) {
          if (generation === ambientGeneration) ambientStarted = false;
          stats.failures += 1;
          return;
        }
        if (disposed || generation !== ambientGeneration) {
          await handle.stop();
          return;
        }
        ambient = handle;
        try {
          await reconcileMusic(handle);
        } catch {
          stats.failures += 1;
        }
        if (disposed || generation !== ambientGeneration) {
          if (ambient === handle) ambient = null;
          await handle.stop();
        }
      },
      () => {
        stats.failures += 1;
        if (generation === ambientGeneration) ambientStarted = false;
      },
    );
  };

  const reconcileOwnedOneShots = () => {
    const channelMuted = effectsChannelMuted();
    for (const handle of oneshots) {
      safeRun(
        'oneshotMuted',
        () => handle.setMuted(channelMuted),
        () => {
          stats.failures += 1;
        },
      );
    }
  };

  const reconcileOwnedMusic = () => {
    for (const handle of [music, ambient]) {
      if (!handle) continue;
      safeRun(
        'setMuted',
        () => reconcileMusic(handle),
        () => {
          stats.failures += 1;
        },
      );
    }
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

  const stopAmbient = () => {
    ambientGeneration += 1;
    const handle = ambient;
    ambient = null;
    ambientStarted = false;
    if (!handle) return;
    safeRun(
      'stopAmbient',
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
      playResolved(cmd);
      if (shouldStartMusicLoop(cmd)) startMusic();
      if (shouldStartAmbientLoop(cmd)) startAmbient();
      if (shouldStopMusicLoop(cmd)) stopMusic();
      if (shouldStopAmbientLoop(cmd)) stopAmbient();
    },
    playUiTap: () => {
      playClip('uiTap');
    },
    playCue: (id) => {
      playClip(id);
    },
    setMuted: (next) => {
      muted = Boolean(next);
      reconcileOwnedOneShots();
      reconcileOwnedMusic();
    },
    setMusicEnabled: (enabled) => {
      musicEnabled = Boolean(enabled);
      reconcileOwnedMusic();
    },
    setEffectsEnabled: (enabled) => {
      effectsEnabled = Boolean(enabled);
      reconcileOwnedOneShots();
    },
    setPlaying: (next) => {
      playing = Boolean(next);
      for (const handle of [music, ambient]) {
        if (!handle) continue;
        safeRun(
          'setPlaying',
          () => handle.setPaused(!playing),
          () => {
            stats.failures += 1;
          },
        );
      }
    },
    reset: () => {
      if (disposed) return;
      stopOwnedOneShots();
      stopMusic();
      stopAmbient();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stopOwnedOneShots();
      stopMusic();
      stopAmbient();
    },
  };
}
