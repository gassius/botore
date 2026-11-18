/**
 * E1: Customise Save Loadout persists paint+weapon; plain errors; no internal ids.
 * Phone frame 390×844 (layout contract + interactive save path).
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

vi.mock('../src/bot/BotAssemblerSlot', () => ({
  BotAssemblerSlot: (props: { testID?: string }) =>
    React.createElement('BotAssemblerSlot', { testID: props.testID ?? 'bot' }),
}));

vi.mock('../src/session-failure/useForcedSessionFailure', () => ({
  useForcedSessionFailure: () => null,
}));

/** C14 wired UI cues into Customise; vitest cannot parse Metro `require(.m4a)`. */
vi.mock('../src/audio/useTrialUiAudio', () => ({
  useTrialUiAudio: () => ({
    playUiTap: () => undefined,
    playCue: () => undefined,
  }),
}));

vi.mock('../src/first-run/FirstRunContext', () => ({
  useFirstRun: () => ({
    muted: true,
    musicEnabled: false,
    effectsEnabled: false,
  }),
}));

import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { measureScreenChromeLayout } from '../src/garage-tag/screenChromeLayout';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import { GarageSessionProvider, useGarageSession } from '../src/garage/LoadoutSessionContext';
import { DevLoadoutSaveAdapter } from '../src/garage/loadout/DevLoadoutSaveAdapter';
import { CustomiseScreen } from '../src/garage/screens/CustomiseScreen';

type SessionProbe = {
  selectPaint: (id: string) => void;
  selectWeapon: (id: string) => void;
  save: () => Promise<boolean>;
  confirmedPaint: () => string | null;
  confirmedWeapon: () => string | null;
  lastError: () => string | null;
  dirty: () => boolean;
  booting: () => boolean;
  canProgress: () => boolean;
  remountHydrateReady: () => boolean;
};

function GarageProbe(props: { apiRef: { current: SessionProbe | null } }): null {
  const garage = useGarageSession();
  props.apiRef.current = {
    selectPaint: (id) => garage.selectPaint(id),
    selectWeapon: (id) => garage.selectWeapon(id),
    save: () => garage.save(),
    confirmedPaint: () => garage.loadout.confirmedLoadout?.paint ?? null,
    confirmedWeapon: () => garage.loadout.confirmedLoadout?.weapon ?? null,
    lastError: () => garage.loadout.lastError,
    dirty: () => garage.loadout.dirty,
    booting: () => garage.booting,
    canProgress: () => garage.canProgress,
    remountHydrateReady: () =>
      garage.loadout.hydration === 'ready' && garage.loadout.confirmedLoadout !== null,
  };
  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function collectText(node: TestRenderer.ReactTestInstance | string): string[] {
  if (typeof node === 'string') return [node];
  const out: string[] = [];
  if (typeof node.props?.children === 'string') out.push(node.props.children);
  if (Array.isArray(node.props?.children)) {
    for (const child of node.props.children) {
      if (typeof child === 'string') out.push(child);
      else if (child) out.push(...collectText(child as TestRenderer.ReactTestInstance));
    }
  } else if (node.props?.children && typeof node.props.children !== 'string') {
    out.push(...collectText(node.props.children as TestRenderer.ReactTestInstance));
  }
  for (const child of node.children ?? []) {
    if (typeof child === 'string') out.push(child);
    else out.push(...collectText(child));
  }
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('E1 Customise Save Loadout (390×844)', () => {
  it('ScreenChrome footer stays usable at iPhone 16 phone frame (390×844)', () => {
    const layout = measureScreenChromeLayout({
      fillInner: true,
      viewportHeight: 844,
      safePadding: 10,
      panelBorder: 3,
      innerPadding: 16,
      footerHeight: 72,
      contentHeight: 700,
      scrollMode: false,
    });
    // Phone-width 390×844 is the design capture frame; D3 keeps EQUIP visible without vertical scroll.
    expect(layout.frameHeight).toBe(824);
    expect(layout.scrollViewportHeight).toBeGreaterThan(500);
    expect(layout.footerRetained).toBe(true);
  });

  it('persists paint+weapon across remount and shows plain save errors', async () => {
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const loadouts = new DevLoadoutSaveAdapter();
    const apiRef: { current: SessionProbe | null } = { current: null };
    let savedNav = 0;

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
        <SafeAreaProvider>
          <GarageSessionProvider auth={auth} loadouts={loadouts}>
            <GarageProbe apiRef={apiRef} />
            <CustomiseScreen
              onBack={() => undefined}
              onSaved={() => {
                savedNav += 1;
              }}
            />
          </GarageSessionProvider>
        </SafeAreaProvider>,
      );
    });

    const api = () => {
      if (!apiRef.current) throw new Error('probe missing');
      return apiRef.current;
    };

    for (let i = 0; i < 40 && (api().booting() || !api().canProgress()); i += 1) {
      await flush();
    }
    expect(api().canProgress()).toBe(true);
    expect(api().confirmedPaint()).toBe('paint-crimson');
    expect(api().confirmedWeapon()).toBe('weapon-sword');

    await act(async () => {
      api().selectPaint('paint-cobalt');
      api().selectWeapon('weapon-axe');
    });
    await flush();
    expect(api().dirty()).toBe(true);

    const saveBtn = root.root.findByProps({ testID: 'customise-save' });
    await act(async () => {
      saveBtn.props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(savedNav).toBe(1);
    expect(api().confirmedPaint()).toBe('paint-cobalt');
    expect(api().confirmedWeapon()).toBe('weapon-axe');
    expect(api().dirty()).toBe(false);

    const treeText = collectText(root.root).join(' ');
    expect(treeText).not.toMatch(/Confirmed:/i);
    expect(() => root.root.findByProps({ testID: 'customise-confirmed-summary' })).toThrow();
    expect(treeText).not.toMatch(/00000000-0000-4000-8000/);
    expect(treeText).not.toMatch(/loadout_version/i);
    expect(treeText).not.toMatch(/…/);

    // Simulate app restart: new provider reads the same adapter store.
    await act(async () => {
      root.update(
        <SafeAreaProvider>
          <GarageSessionProvider auth={auth} loadouts={loadouts}>
            <GarageProbe apiRef={apiRef} />
            <CustomiseScreen onBack={() => undefined} />
          </GarageSessionProvider>
        </SafeAreaProvider>,
      );
    });
    for (let i = 0; i < 40 && (api().booting() || !api().remountHydrateReady()); i += 1) {
      await flush();
    }
    expect(api().confirmedPaint()).toBe('paint-cobalt');
    expect(api().confirmedWeapon()).toBe('weapon-axe');

    // Forced failure surfaces plain language (never silent).
    loadouts.forceFailNext = true;
    await act(async () => {
      api().selectPaint('paint-crimson');
    });
    await flush();
    const failBtn = root.root.findByProps({ testID: 'customise-save' });
    await act(async () => {
      failBtn.props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(api().lastError()).toMatch(/could not save changes/i);
    expect(api().lastError()?.toLowerCase()).not.toContain('http_');
    expect(api().confirmedPaint()).toBe('paint-cobalt');
    const errorBanner = root.root.findByProps({ testID: 'customise-save-error' });
    expect(errorBanner).toBeTruthy();

    const source = readFileSync(
      join(__dirname, '../src/garage/screens/CustomiseScreen.tsx'),
      'utf8',
    );
    expect(source).toContain('Equip');
    expect(source).not.toMatch(/Save loadout/i);
    expect(source).not.toContain('confirmedVersionId');
  });

  it('Supabase adapter maps unpublished_atlas to plain words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: 'unpublished_atlas_version: v1',
              code: '22023',
            }),
            { status: 400 },
          ),
      ),
    );
    const { SupabaseLoadoutSaveAdapter } =
      await import('../src/garage/loadout/SupabaseLoadoutSaveAdapter');
    const adapter = new SupabaseLoadoutSaveAdapter({
      url: 'http://127.0.0.1:54321',
      anonKey: 'eyJ.anon.fake',
    });
    const result = await adapter.save({
      characterId: 'player-hero',
      atlasVersion: 'v1',
      accessToken: 'jwt',
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-cobalt',
        weapon: 'weapon-axe',
        shield: null,
        drone: null,
        decals: [],
        soundTags: [],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/not ready to save/i);
    expect(result.message.toLowerCase()).not.toContain('unpublished_atlas');
  });
});
