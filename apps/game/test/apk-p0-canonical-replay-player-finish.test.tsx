/**
 * PRR M1 — CanonicalReplayPlayer rAF loop must survive victory_screen dwell
 * and call onFinished exactly once (the real loop that APK P0 broke).
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

/** Short queue ending in victory_screen — exercises final dwell without a full fight. */
const { shortQueue, trialAudioApi } = vi.hoisted(() => ({
  shortQueue: [
    { kind: 'show_battle' as const, attacker: 'player-hero', defender: 'opp-1' },
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
import { CanonicalReplayPlayer } from '../src/replay/CanonicalReplayPlayer';
import type { ConfirmedFightResult } from '../src/replay/confirmedResult';
import { commandDuration } from '../src/replay-playback';

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

describe('PRR M1 — CanonicalReplayPlayer onFinished after victory_screen dwell', () => {
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

  it('advances a short queue ending in victory_screen and calls onFinished exactly once', async () => {
    // Node has no rAF — polyfill via setTimeout, then fake those timers + performance.
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback): number =>
        setTimeout(() => cb(performance.now()), 16) as unknown as number,
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id);
    });
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'],
    });

    const onFinished = vi.fn();
    const victoryMs = commandDuration({ kind: 'victory_screen', winner: 'player-hero' });
    expect(victoryMs).toBe(800);

    await act(async () => {
      renderer = TestRenderer.create(
        <CanonicalReplayPlayer
          result={shortConfirmedResult()}
          autoPlay
          muted
          musicEnabled={false}
          effectsEnabled={false}
          reducedMotion
          showLocalControls={false}
          layoutMode="arenaFirst"
          onFinished={onFinished}
          testID="m1-player"
        />,
      );
    });

    expect(onFinished).not.toHaveBeenCalled();

    // Drive rAF through show_battle (0 ms) + victory_screen dwell (800 ms).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(victoryMs + 64);
    });

    expect(onFinished).toHaveBeenCalledTimes(1);

    // Extra frames must not re-fire onFinished.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
