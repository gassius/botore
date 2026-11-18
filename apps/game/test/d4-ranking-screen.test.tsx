/**
 * D4 RankingScreen behavioural — Botores tab calls listBotores; tabs ≥ touchMin.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    ActivityIndicator: make('ActivityIndicator'),
    StyleSheet: { create: (s: object) => s },
    Pressable: make('Pressable'),
    ScrollView: make('ScrollView'),
    RefreshControl: make('RefreshControl'),
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

vi.mock('../src/session-failure/useForcedSessionFailure', () => ({
  useForcedSessionFailure: () => null,
}));

vi.mock('../src/ranking/RankingPortrait', () => ({
  RankingPortrait: (props: { testID?: string }) =>
    React.createElement('RankingPortrait', { testID: props.testID ?? 'ranking-portrait' }),
}));

vi.mock('../src/ranking/BotoreEmblem', () => ({
  BotoreEmblem: (props: { testID?: string }) =>
    React.createElement('BotoreEmblem', { testID: props.testID ?? 'ranking-emblem' }),
}));

import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { garageTag } from '../src/garage-tag';
import {
  DEV_POPULATED_BOTORE_ROWS,
  DEV_POPULATED_RANKING_ROWS,
} from '../src/ranking/fixtures/devRankingFixtures';
import type { RankingReadPort } from '../src/ranking/RankingReadPort';
import { RankingScreen } from '../src/screens/RankingScreen';

function findByTestId(root: ReactTestRenderer, testID: string) {
  return root.root.findByProps({ testID });
}

describe('D4 RankingScreen behavioural', () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
  });

  it('Botores tab calls listBotores (not list) and renders W–L rows', async () => {
    let listCalls = 0;
    let botoreCalls = 0;
    const port: RankingReadPort = {
      list: async () => {
        listCalls += 1;
        return DEV_POPULATED_RANKING_ROWS;
      },
      listBotores: async () => {
        botoreCalls += 1;
        return DEV_POPULATED_BOTORE_ROWS;
      },
    };

    await act(async () => {
      renderer = TestRenderer.create(
        <SafeAreaProvider>
          <RankingScreen port={port} autoLoad />
        </SafeAreaProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listCalls).toBe(1);
    expect(botoreCalls).toBe(0);
    expect(findByTestId(renderer!, 'ranking-list')).toBeTruthy();

    await act(async () => {
      findByTestId(renderer!, 'ranking-tab-botores').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(botoreCalls).toBe(1);
    expect(listCalls).toBe(1);
    expect(findByTestId(renderer!, 'ranking-botore-list')).toBeTruthy();
    const firstBotore = DEV_POPULATED_BOTORE_ROWS[0]!;
    expect(findByTestId(renderer!, `ranking-botore-row-${firstBotore.botoreId}`)).toBeTruthy();
  });

  it('starts on Botores when initialTab is botores and only calls listBotores', async () => {
    let listCalls = 0;
    let botoreCalls = 0;
    const port: RankingReadPort = {
      list: async () => {
        listCalls += 1;
        return DEV_POPULATED_RANKING_ROWS;
      },
      listBotores: async () => {
        botoreCalls += 1;
        return DEV_POPULATED_BOTORE_ROWS;
      },
    };

    await act(async () => {
      renderer = TestRenderer.create(
        <SafeAreaProvider>
          <RankingScreen port={port} autoLoad initialTab="botores" />
        </SafeAreaProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(botoreCalls).toBe(1);
    expect(listCalls).toBe(0);
    expect(findByTestId(renderer!, 'ranking-botore-list')).toBeTruthy();
  });

  it('ranking tabs use garageTag.touchMin (≥48) press budget', () => {
    const src = readFileSync(join(__dirname, '../src/screens/RankingScreen.tsx'), 'utf8');
    expect(garageTag.touchMin).toBe(48);
    expect(src).toContain('minHeight: garageTag.touchMin');
    expect(src).toContain('hitSlop');
    expect(src).not.toMatch(/height:\s*44/);
  });
});
