/**
 * PRR B1: same-route Opponents deep link with fightQuota=remaining must show 2/3
 * (not sticky Full) via reactive FirstRun fightQuotaCaptureScenario.
 */
import React, { act, useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const R = await vi.importActual<typeof import('react')>('react');
  const make =
    (name: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ children, ...props }: any) =>
      R.createElement(name, props, children);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FlatList = ({ data, renderItem, keyExtractor, ...props }: any) =>
    R.createElement(
      'FlatList',
      props,
      (data ?? []).map((item: unknown, index: number) =>
        R.createElement(
          R.Fragment,
          { key: keyExtractor ? keyExtractor(item, index) : String(index) },
          renderItem?.({ item, index }),
        ),
      ),
    );
  return {
    View: make('View'),
    Text: make('Text'),
    Image: make('Image'),
    ActivityIndicator: make('ActivityIndicator'),
    StyleSheet: { create: (s: object) => s },
    Platform: { OS: 'web' },
    FlatList,
    Pressable: make('Pressable'),
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => undefined }),
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

vi.mock('../src/garage-tag/a6Tiles', async () => {
  const match = await import('../src/garage-tag/a6OpponentMatch');
  return {
    ...match,
    a6OpponentPanelSource: (id: string) => ({ uri: `a6-panel:${id}` }),
    a6OpponentPanelForCandidate: () => null,
  };
});

vi.mock('../src/bot/BotAssemblerSlot', () => ({
  BotAssemblerSlot: (props: { testID?: string }) =>
    React.createElement('BotAssemblerSlot', { testID: props.testID ?? 'bot' }),
}));

vi.mock('../src/session-failure/useForcedSessionFailure', () => ({
  useForcedSessionFailure: () => null,
}));

vi.mock('../src/audio/useTrialUiAudio', () => ({
  useTrialUiAudio: () => ({
    playUiTap: () => undefined,
    playCue: () => undefined,
    playSplashSting: () => undefined,
    playFaceOffSting: () => undefined,
    startMenuLoop: () => undefined,
    crossfadeToFight: () => undefined,
    crossfadeToMenu: () => undefined,
  }),
}));

vi.mock('../src/design-capture/captureEnv', async () => {
  const actual = await vi.importActual<typeof import('../src/design-capture/captureEnv')>(
    '../src/design-capture/captureEnv',
  );
  return {
    ...actual,
    isDesignCaptureEnabled: () => true,
  };
});

import TestRenderer, { ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { DesignCaptureFightQuotaScenario } from '../src/design-capture';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import { GarageSessionProvider } from '../src/garage/LoadoutSessionContext';
import { DevLoadoutSaveAdapter } from '../src/garage/loadout/DevLoadoutSaveAdapter';
import { DevOpponentCandidatesAdapter } from '../src/fight/candidates/DevOpponentCandidatesAdapter';
import { FightSessionProvider } from '../src/fight/FightSessionContext';
import { OpponentsScreen } from '../src/fight/screens/OpponentsScreen';
import { DevFightRequestAdapter } from '../src/fight/request/DevFightRequestAdapter';
import {
  DevFightBackendState,
  resetSharedDevFightBackend,
} from '../src/fight/dev/DevFightBackendState';
import { formatDesignCaptureQuotaLog } from '../src/fight/quota/fightQuotaTypes';

/** Shared across every useFirstRun() call in the tree (screen + quota hook). */
let fightQuotaCaptureScenario: DesignCaptureFightQuotaScenario | null = null;
const fightQuotaListeners = new Set<() => void>();

function setFightQuotaCaptureScenario(next: DesignCaptureFightQuotaScenario | null): void {
  fightQuotaCaptureScenario = next;
  for (const listener of fightQuotaListeners) listener();
}

vi.mock('../src/first-run/FirstRunContext', () => ({
  useFirstRun: () => {
    const [, bump] = useState(0);
    useEffect(() => {
      const listener = () => bump((n) => n + 1);
      fightQuotaListeners.add(listener);
      return () => {
        fightQuotaListeners.delete(listener);
      };
    }, []);
    return {
      muted: false,
      musicEnabled: true,
      effectsEnabled: true,
      fightQuotaCaptureScenario,
      setFightQuotaCaptureScenario,
    };
  },
}));

afterEach(() => {
  resetSharedDevFightBackend(3);
  fightQuotaCaptureScenario = null;
  fightQuotaListeners.clear();
  vi.restoreAllMocks();
});

beforeEach(() => {
  resetSharedDevFightBackend(3);
  fightQuotaCaptureScenario = null;
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function findByTestId(root: ReactTestRenderer, testID: string) {
  // Prefer host Text/View nodes — composite wrappers can double-match testIDs.
  return root.root.findAllByProps({ testID }).filter((n) => typeof n.type === 'string');
}

describe('D8 fightQuota design-capture (PRR B1)', () => {
  it('same-route fightQuota=remaining overlays 2/3 and logs the CI marker; null restores Full', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const backend = new DevFightBackendState(3, 3);
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const candidates = new DevOpponentCandidatesAdapter(backend);
    const fights = new DevFightRequestAdapter(backend);
    const loadouts = new DevLoadoutSaveAdapter();

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <SafeAreaProvider>
          <GarageSessionProvider auth={auth} loadouts={loadouts}>
            <FightSessionProvider candidates={candidates} fights={fights}>
              <OpponentsScreen onBack={() => undefined} onContinue={() => undefined} />
            </FightSessionProvider>
          </GarageSessionProvider>
        </SafeAreaProvider>,
      );
    });

    for (let i = 0; i < 40; i += 1) {
      await flush();
      if (findByTestId(tree, 'opponents-fights-remaining-full').length > 0) break;
    }

    expect(findByTestId(tree, 'opponents-fights-remaining-full').length).toBe(1);

    await act(async () => {
      setFightQuotaCaptureScenario('remaining');
    });
    await flush();

    expect(findByTestId(tree, 'opponents-fights-remaining-full').length).toBe(0);
    expect(findByTestId(tree, 'opponents-fights-remaining-countdown').length).toBe(1);
    const panel = findByTestId(tree, 'opponents-fights-remaining')[0];
    expect(String(panel?.props.accessibilityLabel ?? '')).toMatch(
      /Fights remaining 2 of 3, next fight in/i,
    );
    expect(logSpy).toHaveBeenCalledWith(formatDesignCaptureQuotaLog(2, 3));

    await act(async () => {
      setFightQuotaCaptureScenario(null);
    });
    await flush();

    expect(findByTestId(tree, 'opponents-fights-remaining-full').length).toBe(1);
    expect(findByTestId(tree, 'opponents-fights-remaining-countdown').length).toBe(0);
  });

  it('fightQuota=exhausted shows 0/3 header + list without the redundant warning box', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const backend = new DevFightBackendState(3, 3);
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const candidates = new DevOpponentCandidatesAdapter(backend);
    const fights = new DevFightRequestAdapter(backend);
    const loadouts = new DevLoadoutSaveAdapter();

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <SafeAreaProvider>
          <GarageSessionProvider auth={auth} loadouts={loadouts}>
            <FightSessionProvider candidates={candidates} fights={fights}>
              <OpponentsScreen onBack={() => undefined} onContinue={() => undefined} />
            </FightSessionProvider>
          </GarageSessionProvider>
        </SafeAreaProvider>,
      );
    });

    for (let i = 0; i < 40; i += 1) {
      await flush();
      if (findByTestId(tree, 'opponents-fights-remaining-full').length > 0) break;
    }

    await act(async () => {
      setFightQuotaCaptureScenario('exhausted');
    });
    await flush();

    expect(findByTestId(tree, 'opponents-fights-remaining-countdown').length).toBe(1);
    const panel = findByTestId(tree, 'opponents-fights-remaining')[0];
    expect(String(panel?.props.accessibilityLabel ?? '')).toMatch(
      /Fights remaining 0 of 3, next fight in/i,
    );
    expect(findByTestId(tree, 'opponents-no-allowance').length).toBe(0);
    expect(findByTestId(tree, 'opponents-range').length).toBe(1);
    expect(findByTestId(tree, 'opponents-continue')[0]?.props.accessibilityState?.disabled).toBe(
      true,
    );
    expect(logSpy).toHaveBeenCalledWith(formatDesignCaptureQuotaLog(0, 3));
  });
});
