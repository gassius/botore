/**
 * E1 PRR minors — live-fight Fights remaining + shared vs-line parts on screen.
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
    TextInput: make('TextInput'),
    Image: make('Image'),
    ActivityIndicator: make('ActivityIndicator'),
    StyleSheet: { create: (s: object) => s, absoluteFillObject: {} },
    Linking: { openURL: async () => undefined },
    Platform: { OS: 'web' },
    ScrollView: make('ScrollView'),
    Pressable: make('Pressable'),
    Animated: {
      Value: class {
        value: number;
        constructor(v: number) {
          this.value = v;
        }
        setValue(v: number) {
          this.value = v;
        }
        interpolate() {
          return 0;
        }
      },
      timing: () => ({ start: () => undefined, stop: () => undefined }),
      View: make('Animated.View'),
    },
  };
});

vi.mock('react-native-safe-area-context', async () => {
  const R = await vi.importActual<typeof import('react')>('react');
  const SafeAreaContext = R.createContext<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  } | null>(null);
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      R.createElement(
        SafeAreaContext.Provider,
        { value: { top: 0, right: 0, bottom: 0, left: 0 } },
        children,
      ),
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode; testID?: string }) => {
      const insets = R.useContext(SafeAreaContext);
      if (!insets) throw new Error('No safe area value available');
      return R.createElement('SafeAreaView', props, children);
    },
    useSafeAreaInsets: () => {
      const insets = R.useContext(SafeAreaContext);
      if (!insets) throw new Error('No safe area value available');
      return insets;
    },
  };
});

vi.mock('../src/audio/useTrialUiAudio', () => ({
  useTrialUiAudio: () => ({
    playUiTap: () => undefined,
    playCue: () => undefined,
  }),
}));

vi.mock('../src/audio', () => ({
  XP_TICK_MIN_INTERVAL_MS: 40,
  createXpTickGate: () => ({
    tryTick: () => true,
    reset: () => undefined,
  }),
  shouldPlayNewRecordCue: () => false,
  xpTickVariation: () => ({ volumeScale: 1, rate: 1 }),
}));

vi.mock('../src/assembler', () => ({
  BotAssembler: (props: { testID?: string }) =>
    React.createElement('BotAssembler', { testID: props.testID ?? 'bot' }),
}));

vi.mock('../src/result-art', () => ({
  ResultPlate: (props: { testID?: string }) =>
    React.createElement('ResultPlate', { testID: props.testID ?? 'plate' }),
  ResultVictoryPoseSlot: (props: { testID?: string }) =>
    React.createElement('ResultVictoryPoseSlot', { testID: props.testID ?? 'victory' }),
  ResultDefeatPose: (props: { testID?: string }) =>
    React.createElement('ResultDefeatPose', { testID: props.testID ?? 'defeat' }),
}));

vi.mock('../src/replay/fighterLoadout', () => ({
  assemblerLoadoutFromBuild: () => ({
    chassis: 'chassis-basic',
    paint: 'paint-crimson',
    weapon: 'weapon-sword',
  }),
}));

import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import { ResultOverlay } from '../src/result-overlay/ResultOverlay';
import { formatVsLine, formatVsParts } from '../src/result-overlay/resultCardModel';
import type { ConfirmedFightResult } from '../src/replay/confirmedResult';

const fighters = [
  { characterId: 'player-hero', displayName: 'Chispa', weaponKind: 'sword' as const },
  { characterId: 'opp-1', displayName: 'Sir Bot', weaponKind: 'sword' as const },
];

function confirmedStub(
  overrides: Partial<ConfirmedFightResult> & {
    readonly outcome: ConfirmedFightResult['outcome'];
  },
): ConfirmedFightResult {
  return {
    source: 'server',
    serverConfirmed: true,
    battleId: 'battle-hidden',
    rulesVersion: 'combat-v1',
    replayChecksum: 'checksum-hidden',
    xpAwarded: 24,
    allowancesRemaining: 2,
    utcDay: '2026-11-17',
    persistence: 'persisted',
    newRecord: null,
    media: { environmentVersion: 'v001', kitVersion: 'v002' },
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
      battleId: 'battle-hidden',
      rulesVersion: 'combat-v1',
      checksum: 'checksum-hidden',
      seed: '0',
      fighters: fighters as never,
      events: [],
      outcome: overrides.outcome,
    } as never,
    label: 'CONFIRMED',
    ...overrides,
  };
}

function findByTestId(root: ReactTestRenderer, testID: string) {
  return root.root.findByProps({ testID });
}

function flattenText(node: { children?: unknown; props?: { children?: unknown } }): string {
  const children = node.children ?? node.props?.children;
  if (children == null) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    return children
      .map((c) => (typeof c === 'object' && c ? flattenText(c as never) : String(c ?? '')))
      .join('');
  }
  if (typeof children === 'object') return flattenText(children as never);
  return String(children);
}

describe('E1 ResultOverlay render (PRR minors)', () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
  });

  it('shows Fights remaining when record is null (live fight, E2 ranking gated)', () => {
    const confirmed = confirmedStub({
      outcome: { reason: 'defeat', winner: 'player-hero', loser: 'opp-1' },
      allowancesRemaining: 2,
    });
    act(() => {
      renderer = TestRenderer.create(
        <ResultOverlay
          confirmed={confirmed}
          record={null}
          reducedMotion
          muted
          musicEnabled={false}
          effectsEnabled={false}
          rng01={() => 0.5}
          nowMs={() => 0}
        />,
      );
    });
    const context = findByTestId(renderer!, 'result-overlay-context');
    expect(context.props.children).toBe('Fights remaining: 2');
    expect(() => findByTestId(renderer!, 'result-overlay-record')).toThrow();
  });

  it('renders vs line from shared formatVsParts (matches formatVsLine / d2+c17)', () => {
    const confirmed = confirmedStub({
      outcome: { reason: 'defeat', winner: 'player-hero', loser: 'opp-1' },
      allowancesRemaining: 1,
    });
    const parts = formatVsParts('Sir Bot', 'Tito Rivet');
    expect(formatVsLine('Sir Bot', 'Tito Rivet')).toBe(`vs ${parts.bot} · ${parts.botore}`);

    act(() => {
      renderer = TestRenderer.create(
        <ResultOverlay
          confirmed={confirmed}
          record={null}
          opponentBotoreName="Tito Rivet"
          reducedMotion
          muted
          musicEnabled={false}
          effectsEnabled={false}
          rng01={() => 0.5}
          nowMs={() => 0}
        />,
      );
    });
    const vs = findByTestId(renderer!, 'result-overlay-vs');
    const flat = flattenText(vs);
    expect(flat).toBe(formatVsLine('Sir Bot', 'Tito Rivet'));
    expect(flat).not.toMatch(/player-hero|opp-1|battle|checksum/i);
  });
});
