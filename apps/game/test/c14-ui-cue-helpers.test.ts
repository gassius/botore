import { describe, expect, it } from 'vitest';
import {
  XP_TICK_MIN_INTERVAL_MS,
  XP_TICK_RATE_MAX,
  XP_TICK_RATE_MIN,
  XP_TICK_VOLUME_SCALE_MAX,
  XP_TICK_VOLUME_SCALE_MIN,
  createTrialAudioSession,
  createXpTickGate,
  resolveUiCuePlay,
  shouldPlayEquipCue,
  shouldPlayNewRecordCue,
  shouldPlaySelectCue,
  TRIAL_AUDIO_UI_CUE_IDS,
  xpTickVariation,
  type TrialAudioBackend,
  type TrialAudioSources,
} from '../src/audio';

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
};

describe('C14 UI cue helpers for D2/D3', () => {
  it('throttles XP ticks to ≤1 per ~60 ms', () => {
    const gate = createXpTickGate();
    expect(gate.shouldPlay(0)).toBe(true);
    expect(gate.shouldPlay(30)).toBe(false);
    expect(gate.shouldPlay(XP_TICK_MIN_INTERVAL_MS)).toBe(true);
    expect(gate.shouldPlay(XP_TICK_MIN_INTERVAL_MS + 10)).toBe(false);
    gate.reset();
    expect(gate.shouldPlay(0)).toBe(true);
  });

  it('keeps XP tick pitch/volume variation within ±1 semitone / ±2 dB', () => {
    const fixed = xpTickVariation(() => 0);
    expect(fixed.rate).toBeCloseTo(XP_TICK_RATE_MIN, 5);
    expect(fixed.volumeScale).toBeCloseTo(XP_TICK_VOLUME_SCALE_MIN, 5);
    const hi = xpTickVariation(() => 0.999999);
    expect(hi.rate).toBeLessThanOrEqual(XP_TICK_RATE_MAX + 1e-9);
    expect(hi.volumeScale).toBeLessThanOrEqual(XP_TICK_VOLUME_SCALE_MAX + 1e-9);
  });

  it('gates new-record after win, equip after success, select on card tap', () => {
    expect(
      shouldPlayNewRecordCue({
        isNewRecord: true,
        winStarted: true,
        msSinceWinStart: 500,
      }),
    ).toBe(true);
    expect(
      shouldPlayNewRecordCue({
        isNewRecord: true,
        winStarted: true,
        msSinceWinStart: 100,
      }),
    ).toBe(false);
    expect(
      shouldPlayNewRecordCue({
        isNewRecord: false,
        winStarted: true,
        msSinceWinStart: 500,
      }),
    ).toBe(false);
    expect(shouldPlayEquipCue(true)).toBe(true);
    expect(shouldPlayEquipCue(false)).toBe(false);
    expect(shouldPlaySelectCue(true)).toBe(true);
    expect(shouldPlaySelectCue(false)).toBe(false);
  });

  it('playCue surfaces all UI cues when unmuted and none when effects muted', async () => {
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

    const session = createTrialAudioSession({
      backend,
      sources,
      muted: false,
      effectsEnabled: false,
    });
    for (const id of TRIAL_AUDIO_UI_CUE_IDS) {
      const req = resolveUiCuePlay(id, true);
      expect(req?.play).toBe(true);
      if (req) session.playCue(req.id);
    }
    await Promise.resolve();
    expect(played).toHaveLength(0);

    session.setEffectsEnabled(true);
    for (const id of TRIAL_AUDIO_UI_CUE_IDS) session.playCue(id);
    await Promise.resolve();
    expect(played).toEqual([9, 10, 11, 12]);
    session.dispose();
  });
});
