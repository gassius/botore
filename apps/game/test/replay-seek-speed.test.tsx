/**
 * Rewatch controls on the real CanonicalReplayPlayer rAF loop:
 * start-at-end (back from Ranking), scrub seek, and 2× fast-forward.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const R = await vi.importActual<typeof import('react')>('react');
  const make =
    (name: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ children, ...props }: any) =>
      R.createElement(name, props, children);
  return {
    View: make('View'),
    Text: make('Text'),
    Image: make('Image'),
    Pressable: make('Pressable'),
    StyleSheet: { create: (s: object) => s, absoluteFillObject: {} },
    Platform: { OS: 'android' },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => undefined }),
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
    oxide: '#E8771C',
    petrol: '#2a6f7a',
  },
}));

vi.mock('../src/assembler', () => ({
  BotAssembler: (props: { testID?: string }) =>
    React.createElement('BotAssembler', { testID: props.testID ?? 'bot' }),
}));

vi.mock('../src/arena/RepairYardArena', () => ({
  RepairYardArena: ({ children, ...props }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement('RepairYardArena', props, children),
}));

vi.mock('../src/arena/EventFxLayer', () => ({
  EventFxLayer: (props: { testID?: string }) =>
    React.createElement('EventFxLayer', { testID: props.testID ?? 'fx' }),
}));

/** Short queue: two hits then victory_screen dwell. */
const { shortQueue, trialAudioApi } = vi.hoisted(() => ({
  shortQueue: [
    { kind: 'show_battle' as const, attacker: 'player-hero', defender: 'opp-1' },
    { kind: 'turn_banner' as const, actor: 'player-hero' },
    { kind: 'damage_pop' as const, target: 'opp-1', amount: 50, hpAfter: 50 },
    { kind: 'turn_banner' as const, actor: 'player-hero' },
    { kind: 'damage_pop' as const, target: 'opp-1', amount: 50, hpAfter: 0 },
    { kind: 'victory_screen' as const, winner: 'player-hero' },
  ],
  // Stable identity — CanonicalReplayPlayer's rAF effect depends on trialAudio.onCommand.
  trialAudioApi: {
    onCommand: () => undefined,
    playUiTap: () => undefined,
    playCue: () => undefined,
    reset: () => undefined,
  },
}));

vi.mock('../src/audio/useTrialReplayAudio', () => ({
  useTrialReplayAudio: () => trialAudioApi,
}));

vi.mock('../src/replay-playback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/replay-playback')>();
  return {
    ...actual,
    compileAnimationQueue: () => shortQueue.map((cmd) => ({ ...cmd })),
  };
});

import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import { ACTIVE_ENVIRONMENT_ASSET_VERSION } from '../src/arena/environmentPin';
import { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION } from '../src/assembler/workshopFramePin';
import {
  CanonicalReplayPlayer,
  type CanonicalReplayPlayerHandle,
} from '../src/replay/CanonicalReplayPlayer';
import type { ConfirmedFightResult } from '../src/replay/confirmedResult';
import type { PlaybackUiState } from '../src/replay/playbackControl';

const fighters = [
  {
    characterId: 'player-hero',
    displayName: 'Chispa',
    hp: 100,
    weaponKind: 'sword' as const,
  },
  {
    characterId: 'opp-1',
    displayName: 'Sir Bot',
    hp: 100,
    weaponKind: 'sword' as const,
  },
];

function shortConfirmedResult(): ConfirmedFightResult {
  return {
    source: 'dev-fixture',
    serverConfirmed: false,
    battleId: 'm1-short-queue',
    rulesVersion: 'combat-v1',
    replayChecksum: 'm1-short-checksum',
    outcome: { reason: 'defeat', winner: 'player-hero', loser: 'opp-1' },
    xpAwarded: null,
    allowancesRemaining: null,
    utcDay: null,
    persistence: null,
    newRecord: null,
    media: {
      environmentVersion: ACTIVE_ENVIRONMENT_ASSET_VERSION,
      kitVersion: ACTIVE_WORKSHOP_FRAME_ASSET_VERSION,
    },
    builds: {
      attacker: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
      },
      defender: {
        chassis: 'chassis-basic',
        paint: 'paint-cobalt',
        weapon: 'weapon-sword',
      },
    },
    replay: {
      battleId: 'm1-short-queue',
      rulesVersion: 'combat-v1',
      checksum: 'm1-short-checksum',
      seed: '0',
      fighters: fighters as never,
      events: [],
      outcome: { reason: 'defeat', winner: 'player-hero', loser: 'opp-1' },
    } as never,
    label: 'DEV',
  };
}

function stubRaf() {
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: (time: number) => void): number =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    clearTimeout(id);
  });
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'],
  });
}

describe('CanonicalReplayPlayer — seek / speed / start-at-end', () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function mount(
    props: Partial<React.ComponentProps<typeof CanonicalReplayPlayer>>,
    ref?: React.Ref<CanonicalReplayPlayerHandle>,
  ) {
    await act(async () => {
      renderer = TestRenderer.create(
        <CanonicalReplayPlayer
          ref={ref}
          result={shortConfirmedResult()}
          muted
          musicEnabled={false}
          effectsEnabled={false}
          reducedMotion
          showLocalControls={false}
          layoutMode="arenaFirst"
          testID="seek-player"
          {...props}
        />,
      );
    });
  }

  it("initialPosition='end' mounts on the KO frame, paused, without replaying or finishing", async () => {
    stubRaf();
    const onFinished = vi.fn();
    const onCommandApplied = vi.fn();
    const onSeeked = vi.fn();
    const states: PlaybackUiState[] = [];
    await mount({
      autoPlay: true,
      initialPosition: 'end',
      onFinished,
      onCommandApplied,
      onSeeked,
      onPlaybackChange: (s) => states.push(s),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onSeeked).toHaveBeenCalledTimes(1);
    const [presentation, skipped] = onSeeked.mock.calls[0]!;
    expect(skipped).toHaveLength(shortQueue.length);
    expect(presentation.hp.far).toBe(0);
    expect(presentation.finished).toBe(true);
    expect(onCommandApplied).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({ playing: false, progress: 1 });
  });

  it('seekToProgress jumps mid-fight, keeps playing, and still finishes once', async () => {
    stubRaf();
    const ref = React.createRef<CanonicalReplayPlayerHandle>();
    const onFinished = vi.fn();
    const onSeeked = vi.fn();
    await mount({ autoPlay: false, onFinished, onSeeked }, ref);
    act(() => ref.current!.play());
    act(() => ref.current!.seekToProgress(0.5));
    const [presentation, skipped] = onSeeked.mock.calls.at(-1)!;
    expect(skipped).toHaveLength(3);
    expect(presentation.hp.far).toBeCloseTo(0.5);
    expect(ref.current!.getPlaybackState()).toMatchObject({ playing: true, commandIndex: 3 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('seek while paused stays paused', async () => {
    stubRaf();
    const ref = React.createRef<CanonicalReplayPlayerHandle>();
    await mount({ autoPlay: false }, ref);
    act(() => ref.current!.seekToProgress(1 / 3));
    expect(ref.current!.getPlaybackState()).toMatchObject({ playing: false, commandIndex: 2 });
  });

  it('setSpeed(2) halves recorded dwell (fast-forward)', async () => {
    stubRaf();
    const ref = React.createRef<CanonicalReplayPlayerHandle>();
    const at1x = vi.fn();
    await mount({ autoPlay: true, onFinished: at1x }, ref);
    // 2 × turn_banner (250) + victory_screen (800) = 1300 ms at 1×.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(at1x).not.toHaveBeenCalled();
    act(() => {
      renderer!.unmount();
    });

    const fast = vi.fn();
    const ref2 = React.createRef<CanonicalReplayPlayerHandle>();
    await mount({ autoPlay: false, onFinished: fast }, ref2);
    act(() => ref2.current!.setSpeed(2));
    act(() => ref2.current!.play());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(fast).toHaveBeenCalledTimes(1);
  });
});
