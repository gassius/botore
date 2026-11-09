import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { compileAnimationQueue } from '../src/replay-playback';
import {
  ACTIVE_TRIAL_AUDIO_ASSET_VERSION,
  TRIAL_AUDIO_CLIP_IDS,
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

const packRoot = join(process.cwd(), 'assets/trial-audio-v001');

const sources: TrialAudioSources = {
  swing: 1,
  hit: 2,
  dodge: 3,
  defeat: 4,
  hush: 5,
  uiTap: 6,
  win: 7,
  musicLoop: 8,
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

describe('F11 trial-audio-v001 pack seal', () => {
  it('pins coherent trial-audio-v001 and lists the 8 trial clips', () => {
    expect(ACTIVE_TRIAL_AUDIO_ASSET_VERSION).toBe('trial-audio-v001');
    expect(TRIAL_AUDIO_MANIFEST.version).toBe('trial-audio-v001');
    expect(TRIAL_AUDIO_CLIP_IDS).toHaveLength(8);
    for (const id of TRIAL_AUDIO_CLIP_IDS) {
      expect(TRIAL_AUDIO_MANIFEST.clips[id]).toBeTruthy();
      expect(TRIAL_AUDIO_MANIFEST.clips[id].placeholder).toBe(true);
    }
  });

  it('records provenance gate: no paid generation without product-owner go', () => {
    expect(TRIAL_AUDIO_MANIFEST.paid_generation.used).toBe(false);
    expect(TRIAL_AUDIO_MANIFEST.paid_generation.product_owner_go).toBe(false);
    expect(TRIAL_AUDIO_MANIFEST.paid_generation.credit_cost).toBeNull();
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
    expect(sfxClipFromCommand({ kind: 'dodge_anim', actor: 'a' })).toBe('dodge');
    expect(sfxClipFromCommand({ kind: 'damage_pop', target: 'b', amount: 3, hpAfter: 7 })).toBe(
      'hit',
    );
    expect(sfxClipFromCommand({ kind: 'defeat_anim', characterId: 'b' })).toBe('defeat');
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
    const sfx = queue.map((cmd) => sfxClipFromCommand(cmd)).filter(Boolean);
    expect(sfx[0]).toBe('hush');
    expect(sfx).toContain('swing');
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
    session.notifyCommand({ kind: 'damage_pop', target: 'b', amount: 1, hpAfter: 9 });
    await new Promise((r) => setTimeout(r, 0));
    expect(oneshotCreates).toBe(1);
    expect(trialAudioClipVolume('musicLoop')).toBeGreaterThan(0);
    expect(trialAudioClipVolume('musicLoop')).toBeLessThanOrEqual(1);
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
    session.notifyCommand({ kind: 'damage_pop', target: 'b', amount: 1, hpAfter: 9 });
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
