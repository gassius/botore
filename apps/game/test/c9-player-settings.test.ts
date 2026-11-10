import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_SETTINGS,
  applyPendingSettingsPatch,
  effectiveEffectsMuted,
  effectiveMusicMuted,
  mergePlayerSettings,
  normalizePlayerSettings,
} from '../src/settings/prefs';
import { createTrialAudioSession } from '../src/audio/TrialAudioSession';
import type { TrialAudioBackend, LoopHandle, OneShotHandle } from '../src/audio/audioBackend';
import type { TrialAudioSources } from '../src/audio/TrialAudioSession';
import {
  FIRST_RUN_ROUTES,
  isFirstRunRoute,
  nextRoute,
  prevRoute,
  ROUTE_FLOW,
} from '../src/first-run/routes';
import { parseDesignCaptureUrl, buildDesignCaptureUrl } from '../src/design-capture/captureEnv';

const sources = {
  uiTap: { uri: 'ui' },
  hush: { uri: 'hush' },
  swing: { uri: 'swing' },
  hit: { uri: 'hit' },
  dodge: { uri: 'dodge' },
  defeat: { uri: 'defeat' },
  win: { uri: 'win' },
  musicLoop: { uri: 'music' },
} as unknown as TrialAudioSources;

describe('C9 player settings prefs', () => {
  it('normalizes partial / garbage payloads to safe defaults', () => {
    expect(normalizePlayerSettings(null)).toEqual(DEFAULT_PLAYER_SETTINGS);
    expect(normalizePlayerSettings({ muted: true })).toEqual({
      ...DEFAULT_PLAYER_SETTINGS,
      muted: true,
    });
    expect(normalizePlayerSettings({ musicEnabled: 'nope', effectsEnabled: false })).toEqual({
      ...DEFAULT_PLAYER_SETTINGS,
      effectsEnabled: false,
    });
  });

  it('merges patches without dropping sibling fields', () => {
    const next = mergePlayerSettings(
      { ...DEFAULT_PLAYER_SETTINGS, muted: true, musicEnabled: false },
      { effectsEnabled: false },
    );
    expect(next).toEqual({
      muted: true,
      musicEnabled: false,
      effectsEnabled: false,
      forceReducedMotion: false,
    });
  });

  it('hydrate keeps pre-load commits on top of disk prefs (PRR race)', () => {
    const loaded = {
      ...DEFAULT_PLAYER_SETTINGS,
      musicEnabled: false,
      effectsEnabled: false,
      forceReducedMotion: true,
    };
    // Design-capture mute=1 (or Settings tap) before loadPlayerSettings resolves.
    expect(applyPendingSettingsPatch(loaded, { muted: true })).toEqual({
      muted: true,
      musicEnabled: false,
      effectsEnabled: false,
      forceReducedMotion: true,
    });
    expect(applyPendingSettingsPatch(loaded, null)).toEqual(loaded);
    expect(applyPendingSettingsPatch(loaded, {})).toEqual(loaded);
  });

  it('master mute wins over channel toggles', () => {
    expect(effectiveMusicMuted({ muted: true, musicEnabled: true })).toBe(true);
    expect(effectiveMusicMuted({ muted: false, musicEnabled: false })).toBe(true);
    expect(effectiveMusicMuted({ muted: false, musicEnabled: true })).toBe(false);
    expect(effectiveEffectsMuted({ muted: true, effectsEnabled: true })).toBe(true);
    expect(effectiveEffectsMuted({ muted: false, effectsEnabled: false })).toBe(true);
    expect(effectiveEffectsMuted({ muted: false, effectsEnabled: true })).toBe(false);
  });
});

describe('C9 Settings route', () => {
  it('is a first-run route but not in the linear fight flow', () => {
    expect(FIRST_RUN_ROUTES).toContain('Settings');
    expect(ROUTE_FLOW).not.toContain('Settings');
    expect(isFirstRunRoute('Settings')).toBe(true);
    expect(nextRoute('Ranking')).toBeNull();
    expect(prevRoute('Stable')).toBeNull();
    expect(buildDesignCaptureUrl('Settings')).toContain('/Settings');
    expect(parseDesignCaptureUrl('botore://capture/Settings?mute=1')).toEqual({
      route: 'Settings',
      mute: true,
      paintId: null,
      weaponId: null,
      rankingScenario: null,
      failClosed: null,
      poseCompare: null,
      sessionFailure: null,
    });
  });
});

describe('C9 TrialAudioSession music / effects channels', () => {
  it('skips effects when effectsEnabled=false but still starts music loop muted independently', async () => {
    let oneshotCreates = 0;
    let loopCreates = 0;
    const musicMuted: boolean[] = [];
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async () => {
        oneshotCreates += 1;
        return {
          setMuted: async () => undefined,
          play: async () => undefined,
          stop: async () => undefined,
        } satisfies OneShotHandle;
      },
      startLoop: async () => {
        loopCreates += 1;
        return {
          setMuted: async (m) => {
            musicMuted.push(m);
          },
          setPaused: async () => undefined,
          stop: async () => undefined,
        } satisfies LoopHandle;
      },
    };

    const session = createTrialAudioSession({
      backend,
      sources,
      muted: false,
      musicEnabled: true,
      effectsEnabled: false,
    });
    session.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' });
    session.notifyCommand({ kind: 'attack_anim', actor: 'a', attack: 'basic' });
    session.playUiTap();
    await new Promise((r) => setTimeout(r, 0));
    expect(oneshotCreates).toBe(0);
    expect(loopCreates).toBe(1);
    expect(musicMuted.some((m) => m === false)).toBe(true);

    session.setEffectsEnabled(true);
    session.playUiTap();
    await new Promise((r) => setTimeout(r, 0));
    expect(oneshotCreates).toBe(1);

    session.setMusicEnabled(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(musicMuted.at(-1)).toBe(true);
    session.dispose();
  });

  it('master mute silences both channels', async () => {
    let oneshotCreates = 0;
    const musicMuted: boolean[] = [];
    const backend: TrialAudioBackend = {
      ensureMode: async () => undefined,
      playOneShot: async (_s, opts) => {
        if (!opts.muted) oneshotCreates += 1;
        return {
          setMuted: async () => undefined,
          play: async () => undefined,
          stop: async () => undefined,
        };
      },
      startLoop: async () => ({
        setMuted: async (m) => {
          musicMuted.push(m);
        },
        setPaused: async () => undefined,
        stop: async () => undefined,
      }),
    };
    const session = createTrialAudioSession({
      backend,
      sources,
      muted: true,
      musicEnabled: true,
      effectsEnabled: true,
    });
    session.notifyCommand({ kind: 'show_battle', attacker: 'a', defender: 'b' });
    session.playUiTap();
    await new Promise((r) => setTimeout(r, 0));
    expect(oneshotCreates).toBe(0);
    expect(musicMuted.at(-1)).toBe(true);
    session.dispose();
  });
});
