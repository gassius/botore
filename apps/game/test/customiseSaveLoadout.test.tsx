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
    TextInput: make('TextInput'),
    Image: make('Image'),
    ActivityIndicator: make('ActivityIndicator'),
    StyleSheet: {
      create: (s: object) => s,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      flatten: (style: any) => {
        if (!style) return {};
        if (Array.isArray(style)) {
          return Object.assign(
            {},
            ...style.filter(Boolean).map((s: unknown) => (s && typeof s === 'object' ? s : {})),
          );
        }
        return typeof style === 'object' ? style : {};
      },
    },
    Linking: { openURL: async () => undefined },
    Platform: { OS: 'web' },
    ScrollView: make('ScrollView'),
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

vi.mock('../src/bot/BotAssemblerSlot', () => ({
  BotAssemblerSlot: (props: { testID?: string; loadout?: unknown }) =>
    React.createElement('BotAssemblerSlot', {
      testID: props.testID ?? 'bot',
      loadout: props.loadout,
    }),
}));

vi.mock('../src/session-failure/useForcedSessionFailure', () => ({
  useForcedSessionFailure: () => null,
}));

/** C14 wired UI cues into Customise; vitest cannot parse Metro `require(.m4a)`. */
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

vi.mock('../src/first-run/FirstRunContext', () => ({
  useFirstRun: () => ({
    muted: true,
    musicEnabled: false,
    effectsEnabled: false,
    customiseCaptureScenario: null,
  }),
}));

import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { measureScreenChromeLayout } from '../src/garage-tag/screenChromeLayout';
import { BOT_DISPLAY_NAME_MAX_LEN } from '../src/garage/customise/botNameInput';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import { GarageSessionProvider, useGarageSession } from '../src/garage/LoadoutSessionContext';
import { DevLoadoutSaveAdapter } from '../src/garage/loadout/DevLoadoutSaveAdapter';
import { CustomiseScreen } from '../src/garage/screens/CustomiseScreen';
import { STOCK_SHAPE_LOADOUT } from '../src/garage/loadout/proofCatalogue';
import type { GarageLoadout } from '../src/garage/loadout/loadoutTypes';
import { LudusBotCard } from '../src/garage/ludus/LudusBotCard';
import { HEAVIEST_SHAPES, SHAPE_SLOTS, shapePartId } from '../src/assembler/shapes';

type SessionProbe = {
  selectPaint: (id: string) => void;
  selectWeapon: (id: string) => void;
  selectShape: (slot: 'head' | 'body' | 'arms' | 'legs', id: string) => void;
  save: () => Promise<boolean>;
  renameDisplayName: (name: string) => Promise<boolean>;
  confirmedPaint: () => string | null;
  confirmedWeapon: () => string | null;
  confirmedLoadout: () => GarageLoadout | null;
  ownedActiveShapes: () => {
    head: string | null | undefined;
    body: string | null | undefined;
    arms: string | null | undefined;
    legs: string | null | undefined;
  } | null;
  displayName: () => string | null;
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
    selectShape: (slot, id) => garage.selectShape(slot, id),
    save: () => garage.save(),
    renameDisplayName: (name) => garage.renameDisplayName(name),
    confirmedPaint: () => garage.loadout.confirmedLoadout?.paint ?? null,
    confirmedWeapon: () => garage.loadout.confirmedLoadout?.weapon ?? null,
    confirmedLoadout: () => garage.loadout.confirmedLoadout,
    ownedActiveShapes: () => {
      const active = garage.ownedBots.find((b) => b.isActive) ?? garage.ownedBots[0];
      if (!active) return null;
      return {
        head: active.head,
        body: active.body,
        arms: active.arms,
        legs: active.legs,
      };
    },
    displayName: () => garage.loadout.displayName,
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

  it('after Equip, ownedBots / Ludus card carry equipped shapes (not stock)', async () => {
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const loadouts = new DevLoadoutSaveAdapter();
    const apiRef: { current: SessionProbe | null } = { current: null };

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
        <SafeAreaProvider>
          <GarageSessionProvider auth={auth} loadouts={loadouts}>
            <GarageProbe apiRef={apiRef} />
            <CustomiseScreen onBack={() => undefined} />
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
    expect(api().ownedActiveShapes()).toEqual(STOCK_SHAPE_LOADOUT);

    await act(async () => {
      for (const slot of SHAPE_SLOTS) {
        api().selectShape(slot, HEAVIEST_SHAPES[slot]);
      }
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

    const heaviest = {
      head: shapePartId('head', HEAVIEST_SHAPES.head),
      body: shapePartId('body', HEAVIEST_SHAPES.body),
      arms: shapePartId('arms', HEAVIEST_SHAPES.arms),
      legs: shapePartId('legs', HEAVIEST_SHAPES.legs),
    };
    expect(api().confirmedLoadout()).toEqual(expect.objectContaining(heaviest));
    // Design blocker: Ludus ownedBots must refresh on save — not stay stock.
    expect(api().ownedActiveShapes()).toEqual(heaviest);
    expect(heaviest.body).toBe('body-boiler');

    const listed = await loadouts.listOwnedBots('dev-token');
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const active = listed.bots.find((b) => b.isActive) ?? listed.bots[0]!;
    expect(active.body).toBe('body-boiler');

    let ludus!: ReactTestRenderer;
    await act(async () => {
      ludus = TestRenderer.create(<LudusBotCard bot={active} />);
    });
    const assembler = ludus.root.findByProps({ testID: 'ludus-bot-assembler' });
    expect(assembler.props.loadout).toEqual(
      expect.objectContaining({
        body: 'body-boiler',
        head: 'head-welder',
        arms: 'arms-heavy',
        legs: 'legs-piston',
      }),
    );
  });

  it('rejects A6 equip when catalogue ensure is skipped (pre-0038)', async () => {
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const loadouts = new DevLoadoutSaveAdapter();
    loadouts.ensureCatalogueOnResolve = false;
    const apiRef: { current: SessionProbe | null } = { current: null };

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
        <SafeAreaProvider>
          <GarageSessionProvider auth={auth} loadouts={loadouts}>
            <GarageProbe apiRef={apiRef} />
            <CustomiseScreen onBack={() => undefined} />
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

    await act(async () => {
      api().selectWeapon('weapon-mace');
    });
    await flush();
    const saveBtn = root.root.findByProps({ testID: 'customise-save' });
    await act(async () => {
      saveBtn.props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(api().confirmedWeapon()).not.toBe('weapon-mace');
    expect(api().lastError()).toMatch(/do not own that part/i);
  });

  it('equips A6 weapon-mace and paint-hazard (390×844 Equip path)', async () => {
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const loadouts = new DevLoadoutSaveAdapter();
    const apiRef: { current: SessionProbe | null } = { current: null };

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
        <SafeAreaProvider>
          <GarageSessionProvider auth={auth} loadouts={loadouts}>
            <GarageProbe apiRef={apiRef} />
            <CustomiseScreen onBack={() => undefined} />
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

    await act(async () => {
      api().selectWeapon('weapon-mace');
    });
    await flush();
    expect(api().dirty()).toBe(true);

    let saveBtn = root.root.findByProps({ testID: 'customise-save' });
    await act(async () => {
      saveBtn.props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(api().confirmedWeapon()).toBe('weapon-mace');
    expect(api().dirty()).toBe(false);
    expect(api().lastError()).toBeNull();

    await act(async () => {
      api().selectPaint('paint-hazard');
    });
    await flush();
    saveBtn = root.root.findByProps({ testID: 'customise-save' });
    await act(async () => {
      saveBtn.props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(api().confirmedPaint()).toBe('paint-hazard');
    expect(api().confirmedWeapon()).toBe('weapon-mace');
    expect(api().lastError()).toBeNull();
  });

  it('equips A4 welder head + boiler body from shape tabs and keeps them across remount', async () => {
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({ email: 'dev@botore.local', password: 'x' });
    expect(signed.ok).toBe(true);
    const loadouts = new DevLoadoutSaveAdapter();
    const apiRef: { current: SessionProbe | null } = { current: null };
    const tree = (
      <SafeAreaProvider>
        <GarageSessionProvider auth={auth} loadouts={loadouts}>
          <GarageProbe apiRef={apiRef} />
          <CustomiseScreen onBack={() => undefined} />
        </GarageSessionProvider>
      </SafeAreaProvider>
    );
    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(tree);
    });
    const api = () => {
      if (!apiRef.current) throw new Error('probe missing');
      return apiRef.current;
    };
    for (let i = 0; i < 40 && (api().booting() || !api().canProgress()); i += 1) {
      await flush();
    }
    const before = api().confirmedLoadout()!;
    expect(before).toEqual(expect.objectContaining(STOCK_SHAPE_LOADOUT));

    const press = async (testID: string) => {
      await act(async () => {
        root.root.findByProps({ testID }).props.onPress();
      });
      await flush();
    };
    await press('customise-tabs-head');
    expect(root.root.findByProps({ testID: 'customise-picker-card-head-visor' })).toBeTruthy();
    expect(root.root.findByProps({ testID: 'customise-picker-card-head-can' })).toBeTruthy();
    await press('customise-picker-card-head-welder');
    await press('customise-tabs-body');
    await press('customise-picker-card-body-boiler');
    expect(api().dirty()).toBe(true);
    const preview = root.root.findByProps({ testID: 'customise-bot' }).props.loadout as {
      head: string;
      body: string;
    };
    expect(preview.head).toBe('head-welder');
    expect(preview.body).toBe('body-boiler');

    await press('customise-save');
    expect(api().lastError()).toBeNull();
    expect(api().dirty()).toBe(false);
    const saved = api().confirmedLoadout()!;
    expect(saved).toEqual(
      expect.objectContaining({
        head: 'head-welder',
        body: 'body-boiler',
        arms: 'arms-stock',
        legs: 'legs-stock',
        chassis: 'chassis-basic',
      }),
    );
    expect(saved.soundTags).toEqual(before.soundTags);

    await act(async () => {
      root.update(tree);
    });
    for (let i = 0; i < 40 && (api().booting() || !api().remountHydrateReady()); i += 1) {
      await flush();
    }
    expect(api().confirmedLoadout()).toEqual(
      expect.objectContaining({ head: 'head-welder', body: 'body-boiler' }),
    );
  });

  it('Supabase adapter sends A4 shapes in p_loadout', async () => {
    const calls: { body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        calls.push({ body: init.body });
        return new Response(JSON.stringify({ message: 'boom', code: 'XX000' }), { status: 500 });
      }),
    );
    const { SupabaseLoadoutSaveAdapter } =
      await import('../src/garage/loadout/SupabaseLoadoutSaveAdapter');
    const adapter = new SupabaseLoadoutSaveAdapter({
      url: 'http://127.0.0.1:54321',
      anonKey: 'eyJ.anon.fake',
    });
    await adapter.save({
      characterId: 'player-hero',
      atlasVersion: 'v1',
      accessToken: 'jwt',
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        shield: null,
        drone: null,
        decals: [],
        soundTags: ['chassis.light', 'weapon.sword'],
        head: 'head-welder',
        body: 'body-boiler',
        arms: 'arms-heavy',
        legs: 'legs-piston',
      },
    });
    const sent = JSON.parse(calls[0]!.body) as { p_loadout: Record<string, unknown> };
    expect(sent.p_loadout).toEqual(
      expect.objectContaining({
        chassis: 'chassis-basic',
        head: 'head-welder',
        body: 'body-boiler',
        arms: 'arms-heavy',
        legs: 'legs-piston',
      }),
    );
  });

  it('equips paint+weapon after nameplate rename in one Equip press', async () => {
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const loadouts = new DevLoadoutSaveAdapter();
    const apiRef: { current: SessionProbe | null } = { current: null };

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
        <SafeAreaProvider>
          <GarageSessionProvider auth={auth} loadouts={loadouts}>
            <GarageProbe apiRef={apiRef} />
            <CustomiseScreen onBack={() => undefined} />
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

    const editBtn = root.root.findByProps({ testID: 'customise-nameplate-edit' });
    await act(async () => {
      editBtn.props.onPress();
    });
    await flush();
    const input = root.root.findByProps({ testID: 'customise-nameplate-input' });
    await act(async () => {
      input.props.onChangeText('Rivet');
    });
    await flush();

    await act(async () => {
      api().selectPaint('paint-navy');
      api().selectWeapon('weapon-spear');
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

    expect(api().displayName()).toBe('Rivet');
    expect(api().confirmedPaint()).toBe('paint-navy');
    expect(api().confirmedWeapon()).toBe('weapon-spear');
    expect(api().dirty()).toBe(false);
    expect(api().lastError()).toBeNull();
  });

  it('persists nameplate rename across remount via rename RPC', async () => {
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const loadouts = new DevLoadoutSaveAdapter();
    const apiRef: { current: SessionProbe | null } = { current: null };

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
        <SafeAreaProvider>
          <GarageSessionProvider auth={auth} loadouts={loadouts}>
            <GarageProbe apiRef={apiRef} />
            <CustomiseScreen onBack={() => undefined} />
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
    expect(api().displayName()).toBe('Hero');

    const editBtn = root.root.findByProps({ testID: 'customise-nameplate-edit' });
    await act(async () => {
      editBtn.props.onPress();
    });
    await flush();
    const input = root.root.findByProps({ testID: 'customise-nameplate-input' });
    // M1: rendered contract — no textTransform on controlled input; IME strip off; case preserved.
    expect(StyleSheet.flatten(input.props.style).textTransform).toBeUndefined();
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.autoComplete).toBe('off');
    expect(input.props.maxLength).toBe(BOT_DISPLAY_NAME_MAX_LEN);
    await act(async () => {
      input.props.onChangeText('aBcDe');
    });
    await flush();
    const inputAfterCase = root.root.findByProps({ testID: 'customise-nameplate-input' });
    expect(inputAfterCase.props.value).toBe('aBcDe');
    await act(async () => {
      inputAfterCase.props.onChangeText('Rivet');
    });
    await flush();

    const saveBtn = root.root.findByProps({ testID: 'customise-save' });
    await act(async () => {
      saveBtn.props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(api().displayName()).toBe('Rivet');
    expect(collectText(root.root).join(' ')).toMatch(/Equipped|Rivet/);

    // Remount: new provider must hydrate the renamed name from the adapter store.
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
    expect(api().displayName()).toBe('Rivet');
    expect(collectText(root.root).join(' ')).toMatch(/Rivet/);
    expect(collectText(root.root).join(' ')).not.toMatch(/\bHero\b/);

    const source = readFileSync(
      join(__dirname, '../src/garage/screens/CustomiseScreen.tsx'),
      'utf8',
    );
    expect(source).toContain('renameDisplayName');
    expect(source).not.toMatch(/no rename RPC yet/i);
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
        ...STOCK_SHAPE_LOADOUT,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/not ready to save/i);
    expect(result.message.toLowerCase()).not.toContain('unpublished_atlas');
  });
});
