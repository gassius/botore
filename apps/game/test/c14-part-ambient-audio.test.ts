import { describe, it, expect } from 'vitest';
import {
  ARENA_AMBIENT_VOLUME,
  createTrialAudioSession,
  profilesFromFightBuilds,
  resolveOneShotCue,
  shouldStartAmbientLoop,
  shouldStopAmbientLoop,
  weaponSwingCueFromBuild,
  chassisHitCueFromBuild,
  type TrialAudioBackend,
  type TrialAudioSources,
  type LoopHandle,
  type OneShotHandle,
} from '../src/audio';
import { loadDevGoldenConfirmedResult } from '../src/replay';
import { compileAnimationQueue } from '../src/replay-playback';

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

describe('C14 part sound-tag resolution', () => {
  it('maps equipped weapon tags to distinct swing cues', () => {
    expect(weaponSwingCueFromBuild({ weapon: 'weapon-sword', soundTags: ['weapon.sword'] })).toBe(
      'weaponSwordSwing',
    );
    expect(weaponSwingCueFromBuild({ weapon: 'weapon-axe', soundTags: ['weapon.axe'] })).toBe(
      'weaponAxeSwing',
    );
    expect(weaponSwingCueFromBuild({ weapon: 'weapon-dagger', soundTags: ['weapon.dagger'] })).toBe(
      'weaponDaggerSwing',
    );
    expect(
      weaponSwingCueFromBuild({ weapon: 'unknown', soundTags: ['weapon.generic'] }),
    ).toBeNull();
  });

  it('maps chassis.light to chassis-basic hit', () => {
    expect(chassisHitCueFromBuild({ chassis: 'chassis-basic', soundTags: ['chassis.light'] })).toBe(
      'chassisBasicHit',
    );
  });

  it('resolves attack/damage commands to part cues when profiles are known', () => {
    const result = loadDevGoldenConfirmedResult(0);
    const attackerId = result.replay.fighters[0]!.characterId;
    const defenderId = result.replay.fighters[1]!.characterId;
    const profiles = profilesFromFightBuilds({
      attackerId,
      defenderId,
      attacker: {
        ...result.builds.attacker,
        weapon: 'weapon-axe',
        soundTags: ['chassis.light', 'weapon.axe'],
      },
      defender: {
        ...result.builds.defender,
        chassis: 'chassis-basic',
        soundTags: ['chassis.light', 'weapon.sword'],
      },
    });

    expect(
      resolveOneShotCue({ kind: 'attack_anim', actor: attackerId, attack: 'basic' }, profiles),
    ).toEqual({ kind: 'part', id: 'weaponAxeSwing' });
    expect(
      resolveOneShotCue(
        { kind: 'damage_pop', target: defenderId, amount: 2, hpAfter: 8 },
        profiles,
      ),
    ).toEqual({ kind: 'part', id: 'chassisBasicHit' });
    expect(
      resolveOneShotCue({ kind: 'attack_anim', actor: attackerId, attack: 'basic' }, []),
    ).toEqual({ kind: 'base', id: 'swing' });
  });
});

describe('C14 arena ambient loop', () => {
  it('starts on show_battle and stops on victory_screen', () => {
    expect(shouldStartAmbientLoop({ kind: 'show_battle', attacker: 'a', defender: 'b' })).toBe(
      true,
    );
    expect(shouldStopAmbientLoop({ kind: 'victory_screen', winner: 'a' })).toBe(true);
    expect(ARENA_AMBIENT_VOLUME).toBe(0.3);
  });

  it('starts ambient under music channel and stops cleanly on victory / reset', async () => {
    const loopCreates: Array<{ source: unknown; volume: number }> = [];
    const stops: string[] = [];
    const musicMuted: boolean[] = [];
    const ambientMuted: boolean[] = [];

    const makeLoop = (label: string, mutedLog: boolean[]): LoopHandle => ({
      setMuted: async (m) => {
        mutedLog.push(m);
      },
      setPaused: async () => undefined,
      stop: async () => {
        stops.push(label);
      },
    });

    const musicLoop = deferred<LoopHandle | null>();
    const ambientLoop = deferred<LoopHandle | null>();
    let loopCount = 0;

    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () =>
        ({
          setMuted: async () => undefined,
          play: async () => undefined,
          stop: async () => undefined,
        }) satisfies OneShotHandle,
      startLoop: async (source, opts) => {
        loopCreates.push({ source, volume: opts.volume });
        loopCount += 1;
        if (loopCount === 1) return musicLoop.promise;
        return ambientLoop.promise;
      },
    };

    const session = createTrialAudioSession({
      backend,
      sources,
      ambientSource: 99,
      muted: false,
      musicEnabled: true,
      playing: true,
    });

    session.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' });
    expect(loopCreates).toHaveLength(2);
    expect(loopCreates[0]?.source).toBe(8);
    expect(loopCreates[1]?.source).toBe(99);
    expect(loopCreates[1]?.volume).toBe(ARENA_AMBIENT_VOLUME);

    musicLoop.resolve(makeLoop('music', musicMuted));
    ambientLoop.resolve(makeLoop('ambient', ambientMuted));
    await Promise.resolve();
    await Promise.resolve();

    session.setMusicEnabled(false);
    await Promise.resolve();
    expect(musicMuted.at(-1)).toBe(true);
    expect(ambientMuted.at(-1)).toBe(true);

    session.notifyCommand({ kind: 'victory_screen', winner: 'a' });
    await Promise.resolve();
    expect(stops).toEqual(expect.arrayContaining(['music', 'ambient']));

    session.reset();
    session.dispose();
  });

  it('plays equipped weapon swing + chassis hit sources instead of generic base', async () => {
    const played: Array<{ source: unknown; volume: number }> = [];
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async (source, opts) => {
        played.push({ source, volume: opts.volume });
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

    const result = loadDevGoldenConfirmedResult(0);
    const attackerId = result.replay.fighters[0]!.characterId;
    const defenderId = result.replay.fighters[1]!.characterId;
    const session = createTrialAudioSession({
      backend,
      sources,
      partSources: {
        weaponAxeSwing: 41,
        chassisBasicHit: 42,
      },
      fighterProfiles: profilesFromFightBuilds({
        attackerId,
        defenderId,
        attacker: {
          ...result.builds.attacker,
          weapon: 'weapon-axe',
          soundTags: ['chassis.light', 'weapon.axe'],
        },
        defender: {
          ...result.builds.defender,
          soundTags: ['chassis.light', 'weapon.sword'],
        },
      }),
      muted: false,
      effectsEnabled: true,
    });

    session.notifyCommand({ kind: 'attack_anim', actor: attackerId, attack: 'basic' });
    session.notifyCommand({
      kind: 'damage_pop',
      target: defenderId,
      amount: 3,
      hpAfter: 7,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(played.some((p) => p.source === 41)).toBe(true);
    expect(played.some((p) => p.source === 42)).toBe(true);
    expect(played.some((p) => p.source === 1)).toBe(false); // generic swing unused
    expect(played.some((p) => p.source === 2)).toBe(false); // generic hit unused
    session.dispose();
  });

  it('golden queue still yields non-blocking cues with part profiles', () => {
    const result = loadDevGoldenConfirmedResult(0);
    const profiles = profilesFromFightBuilds({
      attackerId: result.replay.fighters[0]!.characterId,
      defenderId: result.replay.fighters[1]!.characterId,
      attacker: result.builds.attacker,
      defender: result.builds.defender,
    });
    const queue = compileAnimationQueue(result.replay);
    const cues = queue.map((cmd) => resolveOneShotCue(cmd, profiles)).filter(Boolean);
    expect(cues[0]).toEqual({ kind: 'base', id: 'hush' });
    expect(cues.some((c) => c?.kind === 'part' && c.id.startsWith('weapon'))).toBe(true);
    expect(cues.some((c) => c?.kind === 'part' && c.id === 'chassisBasicHit')).toBe(true);
  });
});
