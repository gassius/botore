/**
 * Fire-and-forget trial audio session for CanonicalReplayPlayer + app UI.
 * Never throws; never awaits on the fight clock.
 *
 * Music + arena ambient + menu loop start use a generation token invalidated by
 * reset / victory stop / dispose so deferred startLoop completions cannot leak
 * or revive audio. One-shots are owned until natural end, mute, reset, or dispose.
 *
 * Part swings / chassis hits prefer equipped sound tags when sources exist;
 * otherwise fall back to base trial clips.
 *
 * v004: splash/menu ↔ fight crossfade (~600 ms) and the full UI button family.
 */
import type { AnimationCommand } from '../replay-playback';
import { shouldStartMusicLoop, shouldStopMusicLoop } from './cueFromCommand';
import type { AudioSource, LoopHandle, OneShotHandle, TrialAudioBackend } from './audioBackend';
import { createNoopAudioBackend } from './audioBackend';
import { TRIAL_AUDIO_MANIFEST, trialAudioClipVolume } from './trialAudioManifest';
import type { TrialAudioClipId, TrialAudioUiCueId } from './trialAudioPin';
import {
  ARENA_AMBIENT_VOLUME,
  resolveOneShotCues,
  shouldStartAmbientLoop,
  shouldStopAmbientLoop,
  type FighterAudioProfile,
  type PartAudioCueId,
  type ResolvedOneShotCue,
} from './partAudioResolve';

export type TrialAudioSources = Readonly<Record<TrialAudioClipId, AudioSource | null>>;

export type TrialPartAudioSources = Readonly<Partial<Record<PartAudioCueId, AudioSource | null>>>;

/** Optional pitch/volume multipliers for UI cues (e.g. XP tick variation). */
export type PlayCueOptions = {
  readonly rate?: number;
  readonly volumeScale?: number;
};

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
  /** Screen-driven one-shots (Result, Customise, and the v004 UI family). Fire-and-forget. */
  playCue: (id: TrialAudioUiCueId, options?: PlayCueOptions) => void;
  /** Logo / splash sting on the music channel, then typically startMenuLoop. */
  playSplashSting: () => void;
  /** Tale of the Tape face-off sting on the music channel, over menuLoop. */
  playFaceOffSting: () => void;
  /** Start the hangar menu loop (splash and every non-fight screen). Idempotent. */
  startMenuLoop: () => void;
  /** ~600 ms crossfade from menuLoop into the fight musicLoop. */
  crossfadeToFight: (opts?: { durationMs?: number }) => void;
  /** ~600 ms crossfade from the fight musicLoop back to menuLoop (result overlay). */
  crossfadeToMenu: (opts?: { durationMs?: number }) => void;
  /** Update part-cue profiles for the next fight without recreating the session. */
  setFighterProfiles: (profiles: readonly FighterAudioProfile[]) => void;
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
  let fighterProfiles = opts.fighterProfiles ?? [];
  let muted = Boolean(opts.muted);
  let musicEnabled = opts.musicEnabled !== false;
  let effectsEnabled = opts.effectsEnabled !== false;
  let playing = opts.playing !== false;
  let disposed = false;
  let music: LoopHandle | null = null;
  let musicStarted = false;
  /** Bumped on stopMusic / reset / dispose — invalidates in-flight startLoop. */
  let musicGeneration = 0;
  let menu: LoopHandle | null = null;
  let menuStarted = false;
  let menuGeneration = 0;
  const fadeTimers = new Set<ReturnType<typeof setInterval>>();
  let ambient: LoopHandle | null = null;
  let ambientStarted = false;
  let ambientGeneration = 0;
  let modeEnsured = false;
  const oneshots = new Set<OneShotHandle>();
  const stats = { cues: 0, failures: 0 };

  const musicChannelMuted = () => muted || !musicEnabled;
  const effectsChannelMuted = () => muted || !effectsEnabled;

  const channelMutedFor = (id: TrialAudioClipId) => {
    const role = TRIAL_AUDIO_MANIFEST.clips[id]?.role;
    return role === 'music' ? musicChannelMuted() : effectsChannelMuted();
  };

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

  const playSource = (
    label: string,
    source: AudioSource | null | undefined,
    volume: number,
    rate: number | undefined,
    channelMuted: () => boolean,
  ) => {
    if (disposed) return;
    stats.cues += 1;
    if (channelMuted()) return;
    if (source == null) {
      stats.failures += 1;
      return;
    }
    ensureMode();
    const mutedNow = channelMuted();
    const shotOpts =
      typeof rate === 'number' && Number.isFinite(rate)
        ? { volume, muted: mutedNow, rate }
        : { volume, muted: mutedNow };
    safeRun(
      label,
      async () => {
        const handle = await backend.playOneShot(source, shotOpts);
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
          await handle.setMuted(channelMuted());
          if (disposed) {
            await handle.stop();
            forgetOneShot(handle);
            return;
          }
          if (!channelMuted()) {
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

  const playClip = (id: TrialAudioClipId, options?: PlayCueOptions) => {
    const scale =
      typeof options?.volumeScale === 'number' && Number.isFinite(options.volumeScale)
        ? options.volumeScale
        : 1;
    const volume = Math.max(0, Math.min(1, trialAudioClipVolume(id) * scale));
    const rate =
      typeof options?.rate === 'number' && Number.isFinite(options.rate) ? options.rate : undefined;
    playSource(id, sources[id], volume, rate, () => channelMutedFor(id));
  };

  const playResolvedCue = (cue: ResolvedOneShotCue) => {
    if (cue.kind === 'part') {
      const partSource = partSources[cue.id];
      if (partSource != null) {
        // Part clips ship at unity gain; match base swing/hit volume from the trial manifest.
        const volume =
          cue.id === 'chassisBasicHit'
            ? trialAudioClipVolume('hit')
            : trialAudioClipVolume('swing');
        playSource(cue.id, partSource, volume, undefined, effectsChannelMuted);
        return;
      }
      // Missing part source → base fallback (never block).
      playClip(cue.id === 'chassisBasicHit' ? 'hit' : 'swing');
      return;
    }
    playClip(cue.id);
  };

  /** A2: motion_beat may emit several frame-marker clips; part tags still win for swing/hit. */
  const playResolved = (cmd: AnimationCommand) => {
    for (const cue of resolveOneShotCues(cmd, fighterProfiles)) {
      playResolvedCue(cue);
    }
  };

  const reconcileMusic = async (handle: LoopHandle) => {
    await handle.setMuted(musicChannelMuted());
    await handle.setPaused(!playing);
  };

  const reconcileMenu = async (handle: LoopHandle) => {
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

  const startMenu = () => {
    if (disposed || menuStarted) return;
    menuStarted = true;
    const generation = menuGeneration;
    const source = sources.menuLoop;
    if (source == null) {
      stats.failures += 1;
      menuStarted = false;
      return;
    }
    ensureMode();
    const volume = trialAudioClipVolume('menuLoop');
    safeRun(
      'menuLoop',
      async () => {
        const handle = await backend.startLoop(source, { volume });
        if (!handle) {
          if (generation === menuGeneration) menuStarted = false;
          stats.failures += 1;
          return;
        }
        if (disposed || generation !== menuGeneration) {
          await handle.stop();
          return;
        }
        menu = handle;
        try {
          await reconcileMenu(handle);
        } catch {
          stats.failures += 1;
        }
        if (disposed || generation !== menuGeneration) {
          if (menu === handle) menu = null;
          await handle.stop();
        }
      },
      () => {
        stats.failures += 1;
        if (generation === menuGeneration) menuStarted = false;
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
    for (const handle of [music, ambient, menu]) {
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

  const stopMenu = () => {
    menuGeneration += 1;
    const handle = menu;
    menu = null;
    menuStarted = false;
    if (!handle) return;
    safeRun(
      'stopMenu',
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

  const clearFades = () => {
    for (const t of fadeTimers) clearInterval(t);
    fadeTimers.clear();
  };

  const fadeVolume = (
    handle: LoopHandle,
    from: number,
    to: number,
    ms: number,
    onDone?: () => void,
  ) => {
    const setVol = handle.setVolume;
    if (!setVol || ms <= 0) {
      if (setVol) {
        safeRun(
          'setVolume',
          () => setVol(to),
          () => {
            stats.failures += 1;
          },
        );
      }
      onDone?.();
      return;
    }
    const steps = Math.max(4, Math.round(ms / 50));
    let i = 0;
    const timer = setInterval(
      () => {
        i += 1;
        const t = i / steps;
        const v = from + (to - from) * t;
        safeRun(
          'setVolume',
          () => setVol(v),
          () => {
            stats.failures += 1;
          },
        );
        if (i >= steps) {
          clearInterval(timer);
          fadeTimers.delete(timer);
          onDone?.();
        }
      },
      Math.max(16, Math.round(ms / steps)),
    );
    fadeTimers.add(timer);
  };

  const crossfade = (toFight: boolean, durationMs: number) => {
    if (disposed) return;
    clearFades();
    const incomingStart = toFight ? startMusic : startMenu;
    const outgoingStop = toFight ? stopMenu : stopMusic;
    const outgoing = toFight ? menu : music;
    incomingStart();
    const canFade = Boolean(outgoing?.setVolume) && durationMs > 0;
    if (!canFade) {
      outgoingStop();
      return;
    }
    if (outgoing) {
      fadeVolume(
        outgoing,
        trialAudioClipVolume(toFight ? 'menuLoop' : 'musicLoop'),
        0,
        durationMs,
        () => {
          outgoingStop();
        },
      );
    }
    // Incoming handle may still be starting asynchronously — poll briefly for setVolume.
    const targetVol = trialAudioClipVolume(toFight ? 'musicLoop' : 'menuLoop');
    const startedAt = Date.now();
    const tryFadeIn = () => {
      const toHandle = toFight ? music : menu;
      if (toHandle?.setVolume) {
        void toHandle
          .setVolume(0)
          .then(() => {
            fadeVolume(toHandle, 0, targetVol, durationMs);
          })
          .catch(() => {
            stats.failures += 1;
          });
        return;
      }
      if (Date.now() - startedAt < durationMs + 200) {
        setTimeout(tryFadeIn, 40);
      }
    };
    tryFadeIn();
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
    playCue: (id, options) => {
      playClip(id, options);
    },
    playSplashSting: () => {
      playClip('splashSting');
    },
    playFaceOffSting: () => {
      playClip('faceOffSting');
    },
    startMenuLoop: () => {
      startMenu();
    },
    crossfadeToFight: (fadeOpts) => {
      crossfade(true, fadeOpts?.durationMs ?? 600);
    },
    crossfadeToMenu: (fadeOpts) => {
      crossfade(false, fadeOpts?.durationMs ?? 600);
    },
    setFighterProfiles: (profiles) => {
      fighterProfiles = profiles;
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
      for (const handle of [music, ambient, menu]) {
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
      clearFades();
      stopOwnedOneShots();
      stopMusic();
      stopAmbient();
      // Keep menu loop across fight resets so Result / Ludus stay continuous;
      // screens call crossfadeToMenu / startMenuLoop explicitly when needed.
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearFades();
      stopOwnedOneShots();
      stopMusic();
      stopMenu();
      stopAmbient();
    },
  };
}
