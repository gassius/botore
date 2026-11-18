import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { compileAnimationQueue } from '../src/replay-playback';
import {
  ACTIVE_TRIAL_AUDIO_ASSET_VERSION,
  TRIAL_AUDIO_CLIP_IDS,
  TRIAL_AUDIO_UI_CUE_IDS,
  TRIAL_AUDIO_MANIFEST,
  TRIAL_AUDIO_PLATFORM_MODE,
  TRIAL_AUDIO_SEALED_SHA256,
  assertNoPaidGenerationWithoutGo,
  createExpoAvBackend,
  createNoopAudioBackend,
  createTrialAudioSession,
  sfxClipFromCommand,
  shouldStartMusicLoop,
  shouldStopMusicLoop,
  trialAudioClipVolume,
  type ExpoAvModule,
  type LoopHandle,
  type OneShotHandle,
  type TrialAudioBackend,
  type TrialAudioSources,
} from '../src/audio';
import { loadDevGoldenConfirmedResult } from '../src/replay';

const packRoot = join(process.cwd(), 'assets/trial-audio-v004');

const sources: TrialAudioSources = {
  swing: 1,
  hit: 2,
  dodge: 3,
  defeat: 4,
  hush: 5,
  uiTap: 6,
  win: 7,
  musicLoop: 8,
  newRecord: 9,
  xpTick: 10,
  equip: 11,
  select: 12,
  menuLoop: 13,
  splashSting: 14,
  faceOffSting: 22,
  uiConfirm: 15,
  uiBack: 16,
  uiTab: 17,
  uiSnap: 18,
  uiCreate: 19,
  uiError: 20,
  uiToggle: 21,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('F11 trial-audio-v004 pack seal', () => {
  it('pins coherent trial-audio-v004 and lists the 22 trial clips', () => {
    expect(ACTIVE_TRIAL_AUDIO_ASSET_VERSION).toBe('trial-audio-v004');
    expect(TRIAL_AUDIO_MANIFEST.version).toBe('trial-audio-v004');
    expect(TRIAL_AUDIO_CLIP_IDS).toHaveLength(22);
    for (const id of TRIAL_AUDIO_CLIP_IDS) {
      expect(TRIAL_AUDIO_MANIFEST.clips[id]).toBeTruthy();
      expect(TRIAL_AUDIO_MANIFEST.clips[id].placeholder).toBe(false);
    }
  });

  it('records provenance gate: no paid generation without product-owner go', () => {
    expect(TRIAL_AUDIO_MANIFEST.paid_generation.used).toBe(true);
    expect(TRIAL_AUDIO_MANIFEST.paid_generation.product_owner_go).toBe(true);
    expect(TRIAL_AUDIO_MANIFEST.paid_generation.credit_cost).toBe(2916);
    expect(() => assertNoPaidGenerationWithoutGo()).not.toThrow();
    expect(existsSync(join(packRoot, 'PROVENANCE.md'))).toBe(true);
  });

  it('seals runtime m4a + manifest hashes against SHA256SUMS', () => {
    for (const [rel, expected] of Object.entries(TRIAL_AUDIO_SEALED_SHA256)) {
      const bytes = readFileSync(join(packRoot, rel));
      const actual = createHash('sha256').update(bytes).digest('hex');
      expect(actual).toBe(expected);
    }
  });
});

describe('F11 cue mapping from replay commands', () => {
  it('maps combat animation commands to trial SFX ids', () => {
    expect(sfxClipFromCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' })).toBe('hush');
    expect(sfxClipFromCommand({ kind: 'attack_anim', actor: 'a', attack: 'basic' })).toBe('swing');
    // A2: dodge/hit/defeat fire from motion_beat frame markers, not coarse commands.
    expect(sfxClipFromCommand({ kind: 'dodge_anim', actor: 'a' })).toBeNull();
    expect(
      sfxClipFromCommand({ kind: 'damage_pop', target: 'b', amount: 3, hpAfter: 7 }),
    ).toBeNull();
    expect(sfxClipFromCommand({ kind: 'defeat_anim', characterId: 'b' })).toBeNull();
    expect(
      sfxClipFromCommand({
        kind: 'motion_beat',
        actor: 'a',
        poseKey: 'strike',
        frames: 2,
        markers: ['swing'],
      }),
    ).toBe('swing');
    expect(
      sfxClipFromCommand({
        kind: 'motion_beat',
        actor: 'a',
        poseKey: 'strike',
        frames: 3,
        markers: ['hit'],
        hitStop: true,
      }),
    ).toBe('hit');
    expect(sfxClipFromCommand({ kind: 'victory_screen', winner: 'a' })).toBe('win');
    expect(sfxClipFromCommand({ kind: 'victory_screen', winner: null })).toBeNull();
    expect(sfxClipFromCommand({ kind: 'turn_banner', actor: 'a' })).toBeNull();
  });

  it('starts music on show_battle and stops on victory_screen', () => {
    expect(shouldStartMusicLoop({ kind: 'show_battle', attacker: 'a', defender: 'b' })).toBe(true);
    expect(shouldStopMusicLoop({ kind: 'victory_screen', winner: 'a' })).toBe(true);
    expect(shouldStartMusicLoop({ kind: 'attack_anim', actor: 'a', attack: 'weapon' })).toBe(false);
  });

  it('golden replay queue yields the expected SFX sequence (determinism)', () => {
    const result = loadDevGoldenConfirmedResult(0);
    const queue = compileAnimationQueue(result.replay);
    const sfx = queue.flatMap((cmd) => {
      const clip = sfxClipFromCommand(cmd);
      return clip ? [clip] : [];
    });
    expect(sfx[0]).toBe('hush');
    expect(sfx).toContain('swing');
    // Golden 0 has connecting hits — hit clank must be present.
    expect(sfx).toContain('hit');
    expect(sfx[sfx.length - 1] === 'win' || sfx.includes('defeat')).toBe(true);
    const again = compileAnimationQueue(result.replay).map((cmd) => sfxClipFromCommand(cmd));
    expect(again).toEqual(queue.map((cmd) => sfxClipFromCommand(cmd)));
  });
});

describe('F11 TrialAudioSession never blocks / desyncs', () => {
  const nullSources: TrialAudioSources = {
    swing: null,
    hit: null,
    dodge: null,
    defeat: null,
    hush: null,
    uiTap: null,
    win: null,
    musicLoop: null,
    newRecord: null,
    xpTick: null,
    equip: null,
    select: null,
    menuLoop: null,
    splashSting: null,
    faceOffSting: null,
    uiConfirm: null,
    uiBack: null,
    uiTab: null,
    uiSnap: null,
    uiCreate: null,
    uiError: null,
    uiToggle: null,
  };

  it('missing sources increment failures but notifyCommand does not throw', async () => {
    const session = createTrialAudioSession({
      backend: createNoopAudioBackend(),
      sources: nullSources,
      muted: false,
    });
    expect(() =>
      session.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' }),
    ).not.toThrow();
    expect(() =>
      session.notifyCommand({ kind: 'attack_anim', actor: 'a', attack: 'basic' }),
    ).not.toThrow();
    expect(session.stats.cues).toBeGreaterThan(0);
    expect(session.stats.failures).toBeGreaterThan(0);
    session.dispose();
  });

  it('muted mode skips oneshots but still accepts commands', async () => {
    let oneshotCreates = 0;
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => {
        oneshotCreates += 1;
        return {
          setMuted: async () => undefined,
          play: async () => undefined,
          stop: async () => undefined,
        };
      },
      startLoop: async () => ({
        setMuted: async () => undefined,
        setPaused: async () => undefined,
        stop: async () => undefined,
      }),
    };
    const session = createTrialAudioSession({ backend, sources, muted: true });
    session.notifyCommand({ kind: 'attack_anim', actor: 'a', attack: 'basic' });
    session.playUiTap();
    expect(oneshotCreates).toBe(0);
    session.setMuted(false);
    session.notifyCommand({
      kind: 'motion_beat',
      actor: 'a',
      poseKey: 'strike',
      frames: 3,
      markers: ['hit'],
      hitStop: true,
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(oneshotCreates).toBe(1);
    expect(trialAudioClipVolume('musicLoop')).toBeGreaterThan(0);
    expect(trialAudioClipVolume('musicLoop')).toBeLessThanOrEqual(1);
    session.dispose();
  });

  it('playCue plays each UI cue and respects master mute', async () => {
    const played: unknown[] = [];
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async (source) => {
        played.push(source);
        return {
          setMuted: async () => undefined,
          play: async () => undefined,
          stop: async () => undefined,
        };
      },
      startLoop: async () => ({
        setMuted: async () => undefined,
        setPaused: async () => undefined,
        stop: async () => undefined,
      }),
    };
    const session = createTrialAudioSession({ backend, sources, muted: true });
    for (const id of TRIAL_AUDIO_UI_CUE_IDS) session.playCue(id);
    await new Promise((r) => setTimeout(r, 0));
    expect(played).toHaveLength(0);
    session.setMuted(false);
    for (const id of TRIAL_AUDIO_UI_CUE_IDS) session.playCue(id);
    await new Promise((r) => setTimeout(r, 0));
    expect(played).toEqual([9, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21]);
    for (const id of TRIAL_AUDIO_UI_CUE_IDS) {
      expect(TRIAL_AUDIO_MANIFEST.clips[id].kind).toBe('oneshot');
      expect(trialAudioClipVolume(id)).toBeGreaterThan(0);
    }
    session.dispose();
  });

  it('playCue applies rate/volumeScale for xpTick and stays silent when muted', async () => {
    const shots: Array<{ source: unknown; volume: number; rate?: number }> = [];
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async (source, opts) => {
        shots.push({
          source,
          volume: opts.volume,
          ...(opts.rate !== undefined ? { rate: opts.rate } : {}),
        });
        return {
          setMuted: async () => undefined,
          play: async () => undefined,
          stop: async () => undefined,
        };
      },
      startLoop: async () => ({
        setMuted: async () => undefined,
        setPaused: async () => undefined,
        stop: async () => undefined,
      }),
    };
    const session = createTrialAudioSession({ backend, sources, muted: false });
    const base = trialAudioClipVolume('xpTick');
    session.playCue('xpTick', { rate: 1.05, volumeScale: 0.8 });
    await new Promise((r) => setTimeout(r, 0));
    expect(shots).toEqual([{ source: 10, volume: base * 0.8, rate: 1.05 }]);

    session.setMuted(true);
    session.playCue('xpTick', { rate: 0.95, volumeScale: 1.2 });
    await new Promise((r) => setTimeout(r, 0));
    expect(shots).toHaveLength(1);

    session.setMuted(false);
    session.setEffectsEnabled(false);
    session.playCue('xpTick', { rate: 1.02, volumeScale: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(shots).toHaveLength(1);
    session.dispose();
  });

  it('startMenuLoop, playSplashSting and playFaceOffSting honour master mute and the Music toggle', async () => {
    const loops: unknown[] = [];
    const shots: unknown[] = [];
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async (source) => {
        shots.push(source);
        return {
          setMuted: async () => undefined,
          play: async () => undefined,
          stop: async () => undefined,
        };
      },
      startLoop: async (source) => {
        loops.push(source);
        return {
          setMuted: async () => undefined,
          setPaused: async () => undefined,
          stop: async () => undefined,
          setVolume: async () => undefined,
        };
      },
    };
    const session = createTrialAudioSession({ backend, sources, muted: true });
    session.startMenuLoop();
    session.playSplashSting();
    session.playFaceOffSting();
    await new Promise((r) => setTimeout(r, 0));
    // Menu loop handle is created while muted so unmute can resume it, but oneshots stay silent.
    expect(loops).toEqual([13]);
    expect(shots).toHaveLength(0);
    session.setMuted(false);
    session.startMenuLoop();
    session.playSplashSting();
    session.playFaceOffSting();
    await new Promise((r) => setTimeout(r, 0));
    expect(loops).toEqual([13]);
    expect(shots).toEqual([14, 22]);
    expect(TRIAL_AUDIO_MANIFEST.clips.menuLoop.kind).toBe('loop');
    expect(TRIAL_AUDIO_MANIFEST.clips.menuLoop.role).toBe('music');
    expect(trialAudioClipVolume('menuLoop')).toBeGreaterThan(0);
    session.setMusicEnabled(false);
    session.playSplashSting();
    await new Promise((r) => setTimeout(r, 0));
    expect(shots).toEqual([14, 22]);
    session.dispose();
  });

  it('backend failures are swallowed and fight cues continue', async () => {
    const backend: TrialAudioBackend = {
      ensureMode: async () => {
        throw new Error('mode boom');
      },
      playOneShot: async () => {
        throw new Error('sfx boom');
      },
      startLoop: async () => {
        throw new Error('loop boom');
      },
    };
    const session = createTrialAudioSession({ backend, sources });
    expect(() =>
      session.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' }),
    ).not.toThrow();
    expect(() => session.notifyCommand({ kind: 'victory_screen', winner: 'a' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(session.stats.failures).toBeGreaterThan(0);
    session.dispose();
  });
});

describe('F11 deferred load / control transitions (PRR blockers)', () => {
  it('invalidates pending loop starts on reset and victory — stale handle is stopped', async () => {
    const loopA = deferred<LoopHandle>();
    const loopB = deferred<LoopHandle>();
    let startCount = 0;
    const stopped: string[] = [];
    const mutedFlags: Array<{ id: string; muted: boolean }> = [];
    const pausedFlags: Array<{ id: string; paused: boolean }> = [];

    const makeHandle = (id: string): LoopHandle => ({
      setMuted: async (m) => {
        mutedFlags.push({ id, muted: m });
      },
      setPaused: async (p) => {
        pausedFlags.push({ id, paused: p });
      },
      stop: async () => {
        stopped.push(id);
      },
    });

    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => ({
        setMuted: async () => undefined,
        play: async () => undefined,
        stop: async () => undefined,
      }),
      startLoop: async () => {
        startCount += 1;
        if (startCount === 1) return loopA.promise;
        return loopB.promise;
      },
    };

    const session = createTrialAudioSession({ backend, sources, muted: false, playing: true });
    session.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' });
    expect(startCount).toBe(1);

    // Reset while A is still pending, then start B.
    session.reset();
    session.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' });
    expect(startCount).toBe(2);

    loopA.resolve(makeHandle('A'));
    await new Promise((r) => setTimeout(r, 0));
    expect(stopped).toContain('A');
    expect(mutedFlags.find((f) => f.id === 'A')).toBeUndefined();

    loopB.resolve(makeHandle('B'));
    await new Promise((r) => setTimeout(r, 0));
    expect(stopped).not.toContain('B');
    expect(mutedFlags.some((f) => f.id === 'B' && f.muted === false)).toBe(true);
    expect(pausedFlags.some((f) => f.id === 'B' && f.paused === false)).toBe(true);

    // Victory while a third start is pending must not revive music.
    const loopC = deferred<LoopHandle>();
    const backend2: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => ({
        setMuted: async () => undefined,
        play: async () => undefined,
        stop: async () => undefined,
      }),
      startLoop: async () => loopC.promise,
    };
    const session2 = createTrialAudioSession({
      backend: backend2,
      sources,
      muted: false,
      playing: true,
    });
    session2.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' });
    session2.notifyCommand({ kind: 'victory_screen', winner: 'a' });
    const late = makeHandle('C');
    let cStopped = false;
    late.stop = async () => {
      cStopped = true;
    };
    loopC.resolve(late);
    await new Promise((r) => setTimeout(r, 0));
    expect(cStopped).toBe(true);
    session.dispose();
    session2.dispose();
  });

  it('reconciles mute changes that arrive while the loop is still loading', async () => {
    const loop = deferred<LoopHandle>();
    const state = {
      muted: false as boolean | null,
      paused: null as boolean | null,
      stopped: false,
    };
    const handle: LoopHandle = {
      setMuted: async (m) => {
        state.muted = m;
      },
      setPaused: async (p) => {
        state.paused = p;
      },
      stop: async () => {
        state.stopped = true;
      },
    };
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => null,
      startLoop: async () => loop.promise,
    };

    const session = createTrialAudioSession({ backend, sources, muted: false, playing: true });
    session.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' });
    session.setMuted(true);
    loop.resolve(handle);
    await new Promise((r) => setTimeout(r, 0));
    expect(state.muted).toBe(true);
    expect(state.paused).toBe(false);

    // Opposite direction: start muted, unmute while pending.
    const loop2 = deferred<LoopHandle>();
    const state2 = { muted: true as boolean | null, paused: null as boolean | null };
    const handle2: LoopHandle = {
      setMuted: async (m) => {
        state2.muted = m;
      },
      setPaused: async (p) => {
        state2.paused = p;
      },
      stop: async () => undefined,
    };
    const backend2: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => null,
      startLoop: async () => loop2.promise,
    };
    const session2 = createTrialAudioSession({
      backend: backend2,
      sources,
      muted: true,
      playing: true,
    });
    session2.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' });
    session2.setMuted(false);
    loop2.resolve(handle2);
    await new Promise((r) => setTimeout(r, 0));
    expect(state2.muted).toBe(false);
    session.dispose();
    session2.dispose();
  });

  it('owns pending/active one-shots — mute, cancel on dispose, no fight-clock await', async () => {
    const shot = deferred<OneShotHandle>();
    const ops: string[] = [];
    const handle: OneShotHandle = {
      setMuted: async (m) => {
        ops.push(`mute:${m}`);
      },
      play: async () => {
        ops.push('play');
      },
      stop: async () => {
        ops.push('stop');
      },
    };
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => shot.promise,
      startLoop: async () => null,
    };
    const session = createTrialAudioSession({ backend, sources, muted: false });
    // Fire and continue immediately — must not block.
    session.notifyCommand({
      kind: 'motion_beat',
      actor: 'a',
      poseKey: 'strike',
      frames: 3,
      markers: ['hit'],
      hitStop: true,
    });
    session.setMuted(true);
    session.dispose();
    shot.resolve(handle);
    await new Promise((r) => setTimeout(r, 0));
    expect(ops).toContain('stop');
    expect(ops).not.toContain('play');

    // Active oneshot respects mute without dispose.
    const shot2 = deferred<OneShotHandle>();
    const ops2: string[] = [];
    const handle2: OneShotHandle = {
      setMuted: async (m) => {
        ops2.push(`mute:${m}`);
      },
      play: async () => {
        ops2.push('play');
      },
      stop: async () => {
        ops2.push('stop');
      },
    };
    const backend2: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => shot2.promise,
      startLoop: async () => null,
    };
    const session2 = createTrialAudioSession({ backend: backend2, sources, muted: false });
    session2.notifyCommand({ kind: 'attack_anim', actor: 'a', attack: 'basic' });
    shot2.resolve(handle2);
    await new Promise((r) => setTimeout(r, 0));
    expect(ops2).toContain('play');
    session2.setMuted(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(ops2).toContain('mute:true');
    session2.dispose();
  });

  it('unmute does not resume a paused loop (mute ⊥ pause)', async () => {
    let muted = false;
    let playing = true;
    const handle: LoopHandle = {
      setMuted: async (m) => {
        muted = m;
        // Intentionally no play on unmute — backend contract under test via session path
        // uses the real expo wrapper in the next test; here we assert session only calls setMuted.
      },
      setPaused: async (p) => {
        playing = !p;
      },
      stop: async () => undefined,
    };
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => null,
      startLoop: async () => handle,
    };
    const session = createTrialAudioSession({ backend, sources, muted: false, playing: true });
    session.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' });
    await new Promise((r) => setTimeout(r, 0));
    session.setMuted(true);
    session.setPlaying(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(muted).toBe(true);
    expect(playing).toBe(false);
    session.setMuted(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(muted).toBe(false);
    expect(playing).toBe(false); // still paused until Play
    session.setPlaying(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(playing).toBe(true);
    session.dispose();
  });
});

describe('F11 expo-av platform mode policy', () => {
  it('assert platform mode obeys silent switch and pauses on interruptions', async () => {
    expect(TRIAL_AUDIO_PLATFORM_MODE.playsInSilentModeIOS).toBe(false);
    expect(TRIAL_AUDIO_PLATFORM_MODE.shouldDuckAndroid).toBe(false);
    expect(TRIAL_AUDIO_PLATFORM_MODE.interruptionModeIOS).toBe(1);
    expect(TRIAL_AUDIO_PLATFORM_MODE.interruptionModeAndroid).toBe(1);

    const modes: unknown[] = [];
    const sounds: Array<{
      playAsync: () => Promise<void>;
      stopAsync: () => Promise<void>;
      unloadAsync: () => Promise<void>;
      setIsMutedAsync: (m: boolean) => Promise<void>;
      setStatusAsync: (s: Record<string, unknown>) => Promise<void>;
      setOnPlaybackStatusUpdate: (cb: unknown) => void;
      muted: boolean;
      shouldPlay: boolean;
    }> = [];

    const audioModule: ExpoAvModule = {
      Audio: {
        setAudioModeAsync: async (mode) => {
          modes.push(mode);
        },
        Sound: {
          createAsync: async (_source, initial) => {
            const sound = {
              muted: Boolean(initial?.isMuted),
              shouldPlay: Boolean(initial?.shouldPlay),
              playAsync: async () => {
                sound.shouldPlay = true;
              },
              stopAsync: async () => {
                sound.shouldPlay = false;
              },
              unloadAsync: async () => undefined,
              setIsMutedAsync: async (m: boolean) => {
                sound.muted = m;
              },
              setStatusAsync: async (s: Record<string, unknown>) => {
                if ('shouldPlay' in s) sound.shouldPlay = Boolean(s.shouldPlay);
              },
              setOnPlaybackStatusUpdate: (_cb: unknown) => undefined,
            };
            sounds.push(sound);
            return { sound };
          },
        },
      },
    };

    const backend = createExpoAvBackend({ audioModule });
    await backend.ensureMode();
    expect(modes[0]).toEqual({ ...TRIAL_AUDIO_PLATFORM_MODE });

    const loop = await backend.startLoop(1, { volume: 0.5 });
    expect(loop).toBeTruthy();
    expect(sounds[0]?.shouldPlay).toBe(false);

    await loop!.setPaused(false);
    expect(sounds[0]?.shouldPlay).toBe(true);
    await loop!.setMuted(true);
    await loop!.setMuted(false);
    // Unmute must not force-play if we paused separately.
    await loop!.setPaused(true);
    await loop!.setMuted(false);
    expect(sounds[0]?.shouldPlay).toBe(false);
    expect(sounds[0]?.muted).toBe(false);

    const oneshot = await backend.playOneShot(2, { volume: 1, muted: false });
    expect(oneshot).toBeTruthy();
    expect(sounds[1]?.shouldPlay).toBe(false);
    await oneshot!.play();
    expect(sounds[1]?.shouldPlay).toBe(true);
    await oneshot!.setMuted(true);
    expect(sounds[1]?.muted).toBe(true);
    await oneshot!.stop();
  });
});

describe('E8 PRR B1/B2 shared session wiring', () => {
  function recordingBackend() {
    const loops: Array<{
      source: unknown;
      volume: number;
      paused: boolean[];
      muted: boolean[];
      volumes: number[];
      stopped: number;
    }> = [];
    const shots: Array<{ source: unknown; mutedCalls: boolean[] }> = [];
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async (source, opts) => {
        const rec = { source, mutedCalls: [Boolean(opts.muted)] as boolean[] };
        shots.push(rec);
        return {
          setMuted: async (m) => {
            rec.mutedCalls.push(Boolean(m));
          },
          play: async () => undefined,
          stop: async () => undefined,
        };
      },
      startLoop: async (source, opts) => {
        const rec = {
          source,
          volume: opts.volume,
          paused: [] as boolean[],
          muted: [] as boolean[],
          volumes: [] as number[],
          stopped: 0,
        };
        loops.push(rec);
        return {
          setMuted: async (m) => {
            rec.muted.push(Boolean(m));
          },
          setPaused: async (p) => {
            rec.paused.push(Boolean(p));
          },
          stop: async () => {
            rec.stopped += 1;
          },
          setVolume: async (v) => {
            rec.volumes.push(v);
          },
        };
      },
    };
    return { backend, loops, shots };
  }

  it('B1: setPlaying(false) pauses fight loops but leaves menuLoop unpaused after crossfadeToMenu', async () => {
    vi.useFakeTimers();
    const { backend, loops } = recordingBackend();
    const session = createTrialAudioSession({ backend, sources, muted: false, playing: true });
    session.startMenuLoop();
    await vi.advanceTimersByTimeAsync(0);
    expect(loops).toHaveLength(1);
    // Enter fight.
    session.crossfadeToFight({ durationMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(loops.length).toBeGreaterThanOrEqual(2);
    const fight = loops.find((l) => l.source === 8);
    expect(fight).toBeTruthy();
    // Replay ends under Result.
    session.setPlaying(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fight!.paused.at(-1)).toBe(true);
    session.crossfadeToMenu({ durationMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    const menuAfter = loops.filter((l) => l.source === 13).at(-1);
    expect(menuAfter).toBeTruthy();
    // Menu must not stay paused after KO → Result.
    expect(menuAfter!.paused.at(-1)).toBe(false);
    session.setPlaying(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(menuAfter!.paused.filter((p) => p === true)).toHaveLength(0);
    session.dispose();
    vi.useRealTimers();
  });

  it('B2: mute / Music / Effects update the live shared session while running', async () => {
    const { backend, loops, shots } = recordingBackend();
    const session = createTrialAudioSession({
      backend,
      sources,
      muted: false,
      musicEnabled: true,
      effectsEnabled: true,
      playing: true,
    });
    session.startMenuLoop();
    await new Promise((r) => setTimeout(r, 0));
    session.playUiTap();
    await new Promise((r) => setTimeout(r, 0));
    expect(shots).toHaveLength(1);

    session.setMuted(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(loops[0]?.muted.at(-1)).toBe(true);
    session.playUiTap();
    await new Promise((r) => setTimeout(r, 0));
    expect(shots).toHaveLength(1);

    session.setMuted(false);
    session.setEffectsEnabled(false);
    await new Promise((r) => setTimeout(r, 0));
    session.playUiTap();
    await new Promise((r) => setTimeout(r, 0));
    expect(shots).toHaveLength(1);

    session.setEffectsEnabled(true);
    session.setMusicEnabled(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(loops[0]?.muted.at(-1)).toBe(true);
    session.playSplashSting();
    await new Promise((r) => setTimeout(r, 0));
    // splashSting is music-role — Music off silences it.
    expect(shots).toHaveLength(1);
    session.dispose();
  });

  it('M2: in-flight splashSting follows Music, not Effects', async () => {
    const mutedCalls: boolean[] = [];
    const handle: OneShotHandle = {
      setMuted: async (m) => {
        mutedCalls.push(Boolean(m));
      },
      play: async () => undefined,
      stop: async () => undefined,
    };
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => handle,
      startLoop: async () => ({
        setMuted: async () => undefined,
        setPaused: async () => undefined,
        stop: async () => undefined,
        setVolume: async () => undefined,
      }),
    };
    const session = createTrialAudioSession({ backend, sources });
    session.playSplashSting();
    await new Promise((r) => setTimeout(r, 0));
    mutedCalls.length = 0;
    session.setEffectsEnabled(false);
    await new Promise((r) => setTimeout(r, 0));
    // Music still on → sting should not be muted by Effects-off alone.
    expect(mutedCalls.at(-1)).toBe(false);
    session.setMusicEnabled(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(mutedCalls.at(-1)).toBe(true);
    session.dispose();
  });

  it('crossfade starts incoming loop at volume 0', async () => {
    const { backend, loops } = recordingBackend();
    const session = createTrialAudioSession({ backend, sources });
    session.startMenuLoop();
    await new Promise((r) => setTimeout(r, 0));
    session.crossfadeToFight({ durationMs: 100 });
    await new Promise((r) => setTimeout(r, 0));
    const fight = loops.find((l) => l.source === 8);
    expect(fight?.volume).toBe(0);
    session.dispose();
  });

  it('B3: menu → fight → victory_screen → menu restores menuLoop at target volume', async () => {
    vi.useFakeTimers();
    const { backend, loops } = recordingBackend();
    const session = createTrialAudioSession({ backend, sources, muted: false, playing: true });
    session.startMenuLoop();
    await vi.advanceTimersByTimeAsync(0);
    expect(loops.filter((l) => l.source === 13)).toHaveLength(1);
    expect(loops[0]?.volume).toBe(trialAudioClipVolume('menuLoop'));

    session.crossfadeToFight({ durationMs: 100 });
    await vi.advanceTimersByTimeAsync(0);
    const fight = loops.find((l) => l.source === 8);
    expect(fight?.volume).toBe(0);

    // KO / Result path: victory stops fight music, then overlay crossfades to menu
    // with no outgoing handle — must not leave the new menuLoop stuck at 0.
    session.notifyCommand({ kind: 'victory_screen', winner: 'a' });
    await vi.advanceTimersByTimeAsync(0);
    session.crossfadeToMenu({ durationMs: 600 });
    await vi.advanceTimersByTimeAsync(0);
    const menuAfter = loops.filter((l) => l.source === 13).at(-1);
    expect(menuAfter).toBeTruthy();
    expect(menuAfter!.volume).toBe(trialAudioClipVolume('menuLoop'));
    expect(menuAfter!.volume).toBeGreaterThan(0);
    session.dispose();
    vi.useRealTimers();
  });
});
