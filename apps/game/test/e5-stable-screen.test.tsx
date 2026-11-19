/**
 * E5 Ludus StableScreen behavioural — More sheet Sign out / Ranking / Settings|More order.
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
    Modal: ({
      visible,
      children,
      ...props
    }: {
      visible?: boolean;
      children?: React.ReactNode;
      testID?: string;
    }) => (visible ? R.createElement('Modal', props, children) : null),
    StyleSheet: {
      create: (s: object) => s,
      absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    },
    Pressable: make('Pressable'),
    Platform: { OS: 'web' },
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
        { value: { top: 0, right: 0, bottom: 34, left: 0 } },
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

vi.mock('../src/session-failure/useForcedSessionFailure', () => ({
  useForcedSessionFailure: () => null,
}));

vi.mock('../src/bot/BotAssemblerSlot', () => ({
  BotAssemblerSlot: (props: { testID?: string }) =>
    React.createElement('BotAssemblerSlot', { testID: props.testID ?? 'bot' }),
}));

vi.mock('../src/garage/ludus/LudusBotCarousel', () => ({
  LudusBotCarousel: (props: { testID?: string }) =>
    React.createElement('LudusBotCarousel', {
      testID: props.testID ?? 'ludus-bot-carousel',
    }),
}));

const signOut = vi.fn(async () => undefined);
const onRanking = vi.fn();
const onSettings = vi.fn();
const selectActiveBot = vi.fn(async () => true);

vi.mock('../src/garage/LoadoutSessionContext', () => ({
  useGarageSession: () => ({
    loadout: {
      hydration: 'ready',
      displayName: 'Hero',
      confirmedLoadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
      },
      lastError: null,
      lastErrorCode: null,
    },
    canProgress: true,
    signOut,
    retryHydration: async () => undefined,
    ownedBots: [
      {
        characterId: 'player-hero',
        displayName: 'Hero',
        wins: 12,
        losses: 6,
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        head: 'head-visor',
        body: 'body-chassis',
        arms: 'arms-stock',
        legs: 'legs-stock',
        atlasVersion: 'v1',
        isActive: true,
      },
    ],
    botCap: 3,
    selectActiveBot,
    refreshOwnedBots: async () => undefined,
    suggestBotName: async () => 'Rust Baron',
    createOwnedBot: async () => ({ ok: true as const, characterId: 'player-dev-2' }),
  }),
}));

vi.mock('../src/first-run/FirstRunContext', () => ({
  useFirstRun: () => ({
    homeCaptureScenario: null,
    muted: false,
    musicEnabled: true,
    effectsEnabled: true,
  }),
}));

import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StableScreen } from '../src/garage/screens/StableScreen';

function findByTestId(root: ReactTestRenderer, testID: string) {
  return root.root.findByProps({ testID });
}

function tryFindByTestId(root: ReactTestRenderer, testID: string) {
  try {
    return findByTestId(root, testID);
  } catch {
    return null;
  }
}

describe('E5 StableScreen More sheet behavioural', () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    signOut.mockClear();
    onRanking.mockClear();
    onSettings.mockClear();
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
  });

  it('opens More → Sign out once → calls signOut and closes the sheet', async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        <SafeAreaProvider>
          <StableScreen
            onCustomise={() => undefined}
            onFindOpponent={() => undefined}
            onSettings={onSettings}
            onRanking={onRanking}
          />
        </SafeAreaProvider>,
      );
    });

    expect(tryFindByTestId(renderer!, 'stable-more-sheet')).toBeNull();

    await act(async () => {
      findByTestId(renderer!, 'stable-more').props.onPress();
    });
    expect(findByTestId(renderer!, 'stable-more-sheet')).toBeTruthy();

    await act(async () => {
      findByTestId(renderer!, 'stable-sign-out').props.onPress();
      await Promise.resolve();
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(tryFindByTestId(renderer!, 'stable-more-sheet')).toBeNull();
  });

  it('More → Ranking closes the sheet and calls onRanking', async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        <SafeAreaProvider>
          <StableScreen
            onCustomise={() => undefined}
            onFindOpponent={() => undefined}
            onSettings={onSettings}
            onRanking={onRanking}
          />
        </SafeAreaProvider>,
      );
    });

    await act(async () => {
      findByTestId(renderer!, 'stable-more').props.onPress();
    });
    await act(async () => {
      findByTestId(renderer!, 'stable-more-ranking').props.onPress();
    });

    expect(onRanking).toHaveBeenCalledTimes(1);
    expect(tryFindByTestId(renderer!, 'stable-more-sheet')).toBeNull();
  });

  it('footer keeps Settings before More in the side-by-side row', async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        <SafeAreaProvider>
          <StableScreen
            onCustomise={() => undefined}
            onFindOpponent={() => undefined}
            onSettings={onSettings}
            onRanking={onRanking}
          />
        </SafeAreaProvider>,
      );
    });

    const settings = findByTestId(renderer!, 'stable-settings');
    const more = findByTestId(renderer!, 'stable-more');
    const tree = JSON.stringify(renderer!.toJSON());
    expect(tree.indexOf('"stable-settings"')).toBeLessThan(tree.indexOf('"stable-more"'));
    expect(settings).toBeTruthy();
    expect(more).toBeTruthy();
  });
});
