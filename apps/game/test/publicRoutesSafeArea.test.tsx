/**
 * P0: public web routes (outside GarageRoot) must ship their own SafeAreaProvider.
 * ScreenChrome → SafeAreaView throws "No safe area value available" otherwise.
 *
 * Vitest cannot parse RN's Flow entry; mock RN + safe-area-context for render.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    StyleSheet: { create: (s: object) => s },
    Linking: { openURL: async () => undefined },
    Platform: { OS: 'web' },
    ScrollView: make('ScrollView'),
    Pressable: make('Pressable'),
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
        {
          value: { top: 0, right: 0, bottom: 0, left: 0 },
        },
        children,
      ),
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode; testID?: string }) => {
      const insets = R.useContext(SafeAreaContext);
      if (!insets) {
        throw new Error('No safe area value available');
      }
      return R.createElement('SafeAreaView', props, children);
    },
    useSafeAreaInsets: () => {
      const insets = R.useContext(SafeAreaContext);
      if (!insets) throw new Error('No safe area value available');
      return insets;
    },
  };
});

// After mocks — import subjects under test.
import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import { PublicRouteShell } from '../src/account/PublicRouteShell';
import { PublicAccountDeleteScreen } from '../src/garage/screens/PublicAccountDeleteScreen';

const PUBLIC_ROUTES: Array<{
  path: string;
  testID: string;
  screen: () => React.ReactElement;
}> = [
  {
    path: '/account/delete',
    testID: 'slot-public-account-delete',
    screen: () => <PublicAccountDeleteScreen />,
  },
];

describe('public routes SafeAreaProvider', () => {
  let root: ReactTestRenderer | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
  });

  it.each(PUBLIC_ROUTES)(
    'renders $path without SafeArea crash when wrapped',
    ({ testID, screen }) => {
      expect(() => {
        act(() => {
          root = TestRenderer.create(<PublicRouteShell>{screen()}</PublicRouteShell>);
        });
      }).not.toThrow();
      expect(root!.root.findByProps({ testID })).toBeTruthy();
    },
  );

  it('App.tsx wraps the public account-delete return in PublicRouteShell', () => {
    const appPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx');
    const src = readFileSync(appPath, 'utf8');
    expect(src).toMatch(/isPublicAccountDeletePath\(\)/);
    expect(src).toMatch(/<PublicRouteShell>/);
    expect(src).toMatch(/<PublicAccountDeleteScreen\s*\/>/);
    expect(src).toMatch(/<\/PublicRouteShell>/);
  });

  it('PublicAccountDeleteScreen alone crashes without a provider (regression signal)', () => {
    expect(() => {
      act(() => {
        root = TestRenderer.create(<PublicAccountDeleteScreen />);
      });
    }).toThrow(/safe area/i);
  });
});
