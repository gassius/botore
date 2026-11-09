import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { compileAnimationQueue } from '../src/replay-playback';
import {
  ACTIVE_TRIAL_AUDIO_ASSET_VERSION,
  TRIAL_AUDIO_CLIP_IDS,
  TRIAL_AUDIO_MANIFEST,
  TRIAL_AUDIO_SEALED_SHA256,
  assertNoPaidGenerationWithoutGo,
  createNoopAudioBackend,
  createTrialAudioSession,
  sfxClipFromCommand,
  shouldStartMusicLoop,
  shouldStopMusicLoop,
  trialAudioClipVolume,
  type TrialAudioBackend,
  type TrialAudioSources,
} from '../src/audio';
import { loadDevGoldenConfirmedResult } from '../src/replay';

const packRoot = join(process.cwd(), 'assets/trial-audio-v001');

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

  it('muted mode skips oneshots but still accepts commands', () => {
    let oneshots = 0;
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => {
        oneshots += 1;
      },
      startLoop: async () => ({
        setMuted: async () => undefined,
        setPaused: async () => undefined,
        stop: async () => undefined,
      }),
    };
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
    const session = createTrialAudioSession({ backend, sources, muted: true });
    session.notifyCommand({ kind: 'attack_anim', actor: 'a', attack: 'basic' });
    session.playUiTap();
    expect(oneshots).toBe(0);
    session.setMuted(false);
    session.notifyCommand({ kind: 'damage_pop', target: 'b', amount: 1, hpAfter: 9 });
    expect(oneshots).toBe(1);
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
    const session = createTrialAudioSession({ backend, sources });
    expect(() =>
      session.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' }),
    ).not.toThrow();
    expect(() => session.notifyCommand({ kind: 'victory_screen', winner: 'a' })).not.toThrow();
    // Allow microtasks from rejected promises to settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(session.stats.failures).toBeGreaterThan(0);
    session.dispose();
  });
});
