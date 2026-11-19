/**
 * Rewatch band: the big yellow REPLAY button is gone; replay controls
 * (play/pause, scrub bar, 2× fast-forward) sit under a compact hit-message
 * plate inside the same fixed band height (390×844 layout).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const R = await vi.importActual<typeof import('react')>('react');
  const make =
    (name: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ children, ...props }: any) =>
      R.createElement(name, props, typeof children === 'function' ? null : children);
  return {
    View: make('View'),
    Text: make('Text'),
    Image: make('Image'),
    Pressable: make('Pressable'),
    StyleSheet: { create: (s: object) => s, absoluteFillObject: {} },
    Platform: { OS: 'android' },
    Animated: {
      Value: class {
        value: number;
        constructor(v: number) {
          this.value = v;
        }
        setValue(v: number) {
          this.value = v;
        }
        stopAnimation() {}
        interpolate() {
          return '100%';
        }
      },
      timing: () => ({ start: () => undefined, stop: () => undefined }),
      View: make('Animated.View'),
    },
  };
});

vi.mock('../src/garage-tag', () => ({
  garageTag: {
    cream: '#f5ead2',
    graphite: '#1e1c18',
    mustard: '#e3b341',
    mustardPressed: '#c9962a',
    paper: '#efe4cc',
    white: '#ffffff',
    oxide: '#E8771C',
    petrol: '#2a6f7a',
  },
  uiKitAssets: {
    glyphReplay: { uri: 'glyph-replay' },
    glyphPlay: { uri: 'glyph-play' },
    glyphPause: { uri: 'glyph-pause' },
  },
}));

const { playCue } = vi.hoisted(() => ({ playCue: vi.fn() }));

vi.mock('../src/audio/useTrialUiAudio', () => ({
  useTrialUiAudio: () => ({ playUiTap: () => undefined, playCue }),
}));

vi.mock('../src/audio', () => ({
  XP_TICK_MIN_INTERVAL_MS: 40,
  createXpTickGate: () => ({ shouldPlay: () => true, reset: () => undefined }),
  shouldPlayNewRecordCue: () => true,
  xpTickVariation: () => ({ volumeScale: 1, rate: 1 }),
}));

vi.mock('../src/assembler', () => ({
  BotAssembler: (props: { testID?: string }) =>
    React.createElement('BotAssembler', { testID: props.testID ?? 'bot' }),
}));

vi.mock('../src/result-art', () => ({
  ResultPlate: () => null,
  ResultVictoryPoseSlot: () => null,
  ResultDefeatPose: () => null,
}));

vi.mock('../src/replay/fighterLoadout', () => ({
  assemblerLoadoutFromBuild: () => ({
    chassis: 'chassis-basic',
    paint: 'paint-crimson',
    weapon: 'weapon-sword',
  }),
}));

import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import {
  FightViewBottomBand,
  type FightViewTransport,
} from '../src/fight-view/FightViewBottomBand';
import {
  FIGHT_VIEW_BAND_CONTENT_HEIGHT,
  FIGHT_VIEW_REWATCH_CALLOUT_HEIGHT,
  FIGHT_VIEW_REWATCH_CONTROLS_HEIGHT,
  FIGHT_VIEW_REWATCH_FAST_SPEED,
  FIGHT_VIEW_ARENA_HEIGHT_RATIO,
  fightViewShellHeights,
  scrubProgressFromX,
} from '../src/fight-view/types';
import { commandIndexForProgress, presentationAtIndex } from '../src/replay/playbackState';
import type { AnimationCommand } from '../src/replay-playback';
import { ResultOverlay } from '../src/result-overlay/ResultOverlay';
import type { ConfirmedFightResult } from '../src/replay/confirmedResult';

const HIT = { headline: 'Hit', detail: 'Chispa lands a clean strike' };

function transportStub(overrides: Partial<FightViewTransport> = {}): FightViewTransport {
  return {
    playing: true,
    progress: 0.25,
    speed: 1,
    onTogglePlay: vi.fn(),
    onToggleSpeed: vi.fn(),
    onSeek: vi.fn(),
    ...overrides,
  };
}

function byId(r: ReactTestRenderer, testID: string) {
  return r.root.findByProps({ testID });
}

function hasId(r: ReactTestRenderer, testID: string): boolean {
  return r.root.findAll((n) => n.props.testID === testID).length > 0;
}

describe('rewatch band — replay controls replace the REPLAY button', () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = null;
  });

  function mount(props: Partial<React.ComponentProps<typeof FightViewBottomBand>> = {}) {
    act(() => {
      renderer = TestRenderer.create(
        <FightViewBottomBand mode="rewatch" callout={HIT} dwellKey={1} {...props} />,
      );
    });
    return renderer!;
  }

  it('shows hit message + play/pause, scrub, 2× — no big REPLAY button', () => {
    const r = mount({ transport: transportStub() });
    expect(hasId(r, 'fight-view-band-replay')).toBe(false);
    expect(hasId(r, 'fight-view-band-callout')).toBe(true);
    expect(hasId(r, 'fight-view-band-play')).toBe(true);
    expect(hasId(r, 'fight-view-band-scrub')).toBe(true);
    expect(hasId(r, 'fight-view-band-speed')).toBe(true);
    expect(byId(r, 'fight-view-band-play').props.accessibilityLabel).toBe('Pause');
  });

  it('keeps the band at the fixed height (arena never jumps)', () => {
    const r = mount({ transport: transportStub() });
    const band = byId(r, 'fight-view-band');
    const flat = Object.assign({}, ...[band.props.style].flat());
    expect(flat.height).toBe(FIGHT_VIEW_BAND_CONTENT_HEIGHT);
  });

  it('play/pause and 2× call the transport', () => {
    const t = transportStub({ playing: false, progress: 0.4 });
    const r = mount({ transport: t });
    expect(byId(r, 'fight-view-band-play').props.accessibilityLabel).toBe('Play');
    act(() => byId(r, 'fight-view-band-play').props.onPress());
    expect(t.onTogglePlay).toHaveBeenCalledTimes(1);
    act(() => byId(r, 'fight-view-band-speed').props.onPress());
    expect(t.onToggleSpeed).toHaveBeenCalledTimes(1);
    expect(byId(r, 'fight-view-band-speed').props.accessibilityLabel).toBe('Fast forward');
  });

  it('2× shows selected state when fast-forwarding', () => {
    const r = mount({ transport: transportStub({ speed: FIGHT_VIEW_REWATCH_FAST_SPEED }) });
    const speed = byId(r, 'fight-view-band-speed');
    expect(speed.props.accessibilityState).toEqual({ selected: true });
    expect(speed.props.accessibilityLabel).toBe('Normal speed');
  });

  it('ended replay turns play into Replay fight', () => {
    const r = mount({ transport: transportStub({ playing: false, progress: 1 }) });
    expect(byId(r, 'fight-view-band-play').props.accessibilityLabel).toBe('Replay fight');
  });

  it('dragging the scrub bar previews then seeks on release', () => {
    const t = transportStub({ progress: 0.1 });
    const r = mount({ transport: t });
    const scrub = byId(r, 'fight-view-band-scrub');
    act(() => scrub.props.onLayout({ nativeEvent: { layout: { width: 200, height: 48 } } }));
    act(() => scrub.props.onResponderGrant({ nativeEvent: { locationX: 50 } }));
    act(() =>
      byId(r, 'fight-view-band-scrub').props.onResponderMove({ nativeEvent: { locationX: 150 } }),
    );
    expect(byId(r, 'fight-view-band-scrub').props.accessibilityValue.now).toBe(75);
    expect(t.onSeek).not.toHaveBeenCalled();
    act(() =>
      byId(r, 'fight-view-band-scrub').props.onResponderRelease({
        nativeEvent: { locationX: 150 },
      }),
    );
    expect(t.onSeek).toHaveBeenCalledWith(0.75);
    expect(byId(r, 'fight-view-band-scrub').props.accessibilityValue.now).toBe(10);
  });

  it('scrub supports screen-reader increment / decrement', () => {
    const t = transportStub({ progress: 0.5 });
    const r = mount({ transport: t });
    act(() =>
      byId(r, 'fight-view-band-scrub').props.onAccessibilityAction({
        nativeEvent: { actionName: 'increment' },
      }),
    );
    expect(t.onSeek).toHaveBeenLastCalledWith(0.6);
  });

  it('first watch never shows transport (no replay reveal)', () => {
    act(() => {
      renderer = TestRenderer.create(
        <FightViewBottomBand
          mode="firstWatch"
          callout={HIT}
          dwellKey={1}
          transport={transportStub()}
        />,
      );
    });
    expect(hasId(renderer!, 'fight-view-band-controls')).toBe(false);
    expect(hasId(renderer!, 'fight-view-band-callout')).toBe(true);
  });
});

describe('rewatch band layout at 390×844', () => {
  it('compact plate + gap + controls fit inside the fixed band; arena share holds', () => {
    const inner = FIGHT_VIEW_BAND_CONTENT_HEIGHT - 4 /* top rule */ - 10 - 12;
    expect(
      FIGHT_VIEW_REWATCH_CALLOUT_HEIGHT + 8 + FIGHT_VIEW_REWATCH_CONTROLS_HEIGHT,
    ).toBeLessThanOrEqual(inner);
    expect(FIGHT_VIEW_REWATCH_CONTROLS_HEIGHT).toBeGreaterThanOrEqual(48);
    expect(fightViewShellHeights(844).arenaRatio).toBeGreaterThanOrEqual(
      FIGHT_VIEW_ARENA_HEIGHT_RATIO - 0.03,
    );
  });

  it('scrubProgressFromX clamps to the track', () => {
    expect(scrubProgressFromX(-10, 200)).toBe(0);
    expect(scrubProgressFromX(100, 200)).toBe(0.5);
    expect(scrubProgressFromX(400, 200)).toBe(1);
    expect(scrubProgressFromX(10, 0)).toBe(0);
  });
});

describe('seek helpers', () => {
  const queue: AnimationCommand[] = [
    { kind: 'show_battle', attacker: 'a', defender: 'b' },
    { kind: 'damage_pop', target: 'b', amount: 40, hpAfter: 60 },
    { kind: 'damage_pop', target: 'b', amount: 60, hpAfter: 0 },
    { kind: 'defeat_anim', characterId: 'b' },
    { kind: 'victory_screen', winner: 'a' },
  ];
  const ids = { nearId: 'a', farId: 'b' };
  const maxHp = { near: 100, far: 100 };

  it('presentationAtIndex lands on the same HP / pose as playing through, without FX', () => {
    const mid = presentationAtIndex(queue, 2, ids, maxHp);
    expect(mid.cueSeq).toBe(2);
    expect(mid.presentation.hp.far).toBeCloseTo(0.6);
    expect(mid.presentation.activeFx).toEqual([]);
    const end = presentationAtIndex(queue, queue.length, ids, maxHp);
    expect(end.presentation.hp.far).toBe(0);
    expect(end.presentation.far.motionPose).toBe('defeat');
    expect(end.presentation.finished).toBe(true);
    expect(end.presentation.activeFx).toEqual([]);
  });

  it('commandIndexForProgress clamps and rounds', () => {
    expect(commandIndexForProgress(0.5, 5)).toBe(3);
    expect(commandIndexForProgress(-1, 5)).toBe(0);
    expect(commandIndexForProgress(2, 5)).toBe(5);
    expect(commandIndexForProgress(Number.NaN, 5)).toBe(0);
  });
});

describe('ResultOverlay skipIntro (back from Ranking)', () => {
  const fighters = [
    { characterId: 'player-hero', displayName: 'Chispa', weaponKind: 'sword' as const },
    { characterId: 'opp-1', displayName: 'Sir Bot', weaponKind: 'sword' as const },
  ];
  const confirmed = {
    source: 'server',
    serverConfirmed: true,
    battleId: 'b',
    rulesVersion: 'combat-v1',
    replayChecksum: 'c',
    outcome: { reason: 'defeat', winner: 'player-hero', loser: 'opp-1' },
    xpAwarded: 24,
    allowancesRemaining: 2,
    utcDay: '2026-11-19',
    persistence: 'persisted',
    newRecord: true,
    media: { environmentVersion: 'v001', kitVersion: 'v002' },
    builds: {
      attacker: { chassis: 'chassis-basic', paint: 'paint-crimson', weapon: 'weapon-sword' },
      defender: { chassis: 'chassis-basic', paint: 'paint-cobalt', weapon: 'weapon-sword' },
    },
    replay: {
      battleId: 'b',
      rulesVersion: 'combat-v1',
      checksum: 'c',
      seed: '0',
      fighters,
      events: [],
      outcome: { reason: 'defeat', winner: 'player-hero', loser: 'opp-1' },
    },
    label: 'CONFIRMED',
  } as unknown as ConfirmedFightResult;

  afterEach(() => {
    vi.useRealTimers();
    playCue.mockReset();
  });

  it('mounts settled: full XP, no XP ticks / NEW RECORD cue replayed', () => {
    vi.useFakeTimers();
    let r: ReactTestRenderer | null = null;
    act(() => {
      r = TestRenderer.create(
        <ResultOverlay confirmed={confirmed} skipIntro nowMs={() => 0} rng01={() => 0.5} />,
      );
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(playCue).not.toHaveBeenCalled();
    act(() => r!.unmount());
  });

  it('first open still plays the intro cues', () => {
    vi.useFakeTimers();
    let r: ReactTestRenderer | null = null;
    act(() => {
      r = TestRenderer.create(
        <ResultOverlay confirmed={confirmed} nowMs={() => 0} rng01={() => 0.5} />,
      );
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(playCue).toHaveBeenCalledWith('xpTick', expect.anything());
    act(() => r!.unmount());
  });
});
