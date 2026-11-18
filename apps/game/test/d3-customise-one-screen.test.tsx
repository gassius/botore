/**
 * D3: Customise one screen — bigger robot, horizontal picker, EQUIP copy, cues.
 * Phone frame 390×844; no vertical scroll; C17 no player-facing ids.
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
  BotAssemblerSlot: (props: { testID?: string; size?: number }) =>
    React.createElement('BotAssemblerSlot', {
      testID: props.testID ?? 'bot',
      size: props.size,
    }),
}));

vi.mock('../src/session-failure/useForcedSessionFailure', () => ({
  useForcedSessionFailure: () => null,
}));

const playCue = vi.fn();

vi.mock('../src/audio/useTrialUiAudio', () => ({
  useTrialUiAudio: () => ({
    playUiTap: () => undefined,
    playCue,
  }),
}));

vi.mock('../src/first-run/FirstRunContext', () => ({
  useFirstRun: () => ({
    muted: false,
    musicEnabled: true,
    effectsEnabled: true,
  }),
}));

import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { measureScreenChromeLayout } from '../src/garage-tag/screenChromeLayout';
import {
  CUSTOMISE_BOT_SIZE,
  CUSTOMISE_STAGE_HEIGHT,
  COMING_SOON_WEAPONS,
  buildWeaponPickerCards,
} from '../src/garage/customise/customiseSlots';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import { GarageSessionProvider, useGarageSession } from '../src/garage/LoadoutSessionContext';
import { DevLoadoutSaveAdapter } from '../src/garage/loadout/DevLoadoutSaveAdapter';
import { CustomiseScreen } from '../src/garage/screens/CustomiseScreen';

type SessionProbe = {
  selectPaint: (id: string) => void;
  selectWeapon: (id: string) => void;
  discard: () => void;
  save: () => Promise<boolean>;
  dirty: () => boolean;
  booting: () => boolean;
  canProgress: () => boolean;
  confirmedWeapon: () => string | null;
  lastError: () => string | null;
};

function GarageProbe(props: { apiRef: { current: SessionProbe | null } }): null {
  const garage = useGarageSession();
  props.apiRef.current = {
    selectPaint: (id) => garage.selectPaint(id),
    selectWeapon: (id) => garage.selectWeapon(id),
    discard: () => garage.discard(),
    save: () => garage.save(),
    dirty: () => garage.loadout.dirty,
    booting: () => garage.booting,
    canProgress: () => garage.canProgress,
    confirmedWeapon: () => garage.loadout.confirmedLoadout?.weapon ?? null,
    lastError: () => garage.loadout.lastError,
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

async function mountCustomise(): Promise<{
  root: ReactTestRenderer;
  api: () => SessionProbe;
}> {
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
  return { root, api };
}

afterEach(() => {
  playCue.mockReset();
  vi.restoreAllMocks();
});

describe('D3 Customise one screen (390×844)', () => {
  it('keeps a non-scroll body viewport usable at iPhone 16 phone frame', () => {
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
    expect(layout.frameHeight).toBe(824);
    expect(layout.scrollViewportHeight).toBeGreaterThan(500);
    expect(layout.footerRetained).toBe(true);
  });

  it('renders one-screen layout: stage, tabs, strip, EQUIP — no Confirmed/UNSAVED', async () => {
    const { root, api } = await mountCustomise();
    const source = readFileSync(
      join(__dirname, '../src/garage/screens/CustomiseScreen.tsx'),
      'utf8',
    );

    expect(source).toMatch(/scroll=\{false\}/);
    expect(source).toContain('Equip');
    expect(source).not.toMatch(/Save loadout/i);
    expect(source).not.toMatch(/UNSAVED PREVIEW/);
    expect(source).not.toMatch(/Confirmed:/i);
    expect(CUSTOMISE_STAGE_HEIGHT).toBe(410);
    expect(CUSTOMISE_BOT_SIZE).toBeGreaterThanOrEqual(320);

    expect(root.root.findByProps({ testID: 'customise-body' })).toBeTruthy();
    expect(root.root.findByProps({ testID: 'customise-actions' })).toBeTruthy();

    const stage = root.root.findByProps({ testID: 'customise-stage' });
    expect(stage.props.style).toEqual(expect.objectContaining({ height: CUSTOMISE_STAGE_HEIGHT }));

    const bot = root.root.findByProps({ testID: 'customise-bot' });
    expect(bot.props.size).toBe(CUSTOMISE_BOT_SIZE);

    for (const id of ['paint', 'head', 'body', 'arms', 'legs', 'weapon'] as const) {
      expect(root.root.findByProps({ testID: `customise-tabs-${id}` })).toBeTruthy();
    }
    expect(
      root.root.findByProps({ testID: 'customise-tabs-head' }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
    expect(
      root.root.findByProps({ testID: 'customise-tabs-weapon' }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true, disabled: false }));

    // Catalogue-driven strip: owned + coming-soon peek cards.
    expect(root.root.findByProps({ testID: 'customise-picker-card-weapon-sword' })).toBeTruthy();
    expect(root.root.findByProps({ testID: 'customise-picker-card-weapon-axe' })).toBeTruthy();
    expect(root.root.findByProps({ testID: 'customise-picker-card-weapon-dagger' })).toBeTruthy();
    for (const soon of COMING_SOON_WEAPONS) {
      expect(root.root.findByProps({ testID: `customise-picker-card-${soon.id}` })).toBeTruthy();
      expect(root.root.findByProps({ testID: `part-card-soon-${soon.id}` })).toBeTruthy();
    }

    const cards = buildWeaponPickerCards('sword');
    expect(cards.filter((c) => !c.locked)).toHaveLength(3);
    expect(cards.some((c) => c.locked)).toBe(true);

    const treeText = collectText(root.root).join(' ');
    expect(treeText).not.toMatch(/Confirmed:/i);
    expect(treeText).not.toMatch(/UNSAVED PREVIEW/i);
    expect(treeText).not.toMatch(/00000000-0000-4000-8000/);
    expect(treeText).not.toMatch(/paint-crimson|weapon-sword|loadout_version/i);
    expect(treeText).toMatch(/Equip/i);
    expect(treeText).toMatch(/Discard/i);
    expect(treeText).toMatch(/Coming soon/i);

    // Dirty → Oxide unsaved dot on EQUIP; Discard restores.
    expect(api().dirty()).toBe(false);
    expect(() => root.root.findByProps({ testID: 'customise-save-unsaved-dot' })).toThrow();

    const axeCard = root.root.findByProps({ testID: 'customise-picker-card-weapon-axe' });
    await act(async () => {
      axeCard.props.onPress();
    });
    await flush();
    expect(api().dirty()).toBe(true);
    expect(playCue).toHaveBeenCalledWith('select');
    expect(root.root.findByProps({ testID: 'customise-save-unsaved-dot' })).toBeTruthy();

    const discard = root.root.findByProps({ testID: 'customise-discard' });
    await act(async () => {
      discard.props.onPress();
    });
    await flush();
    expect(api().dirty()).toBe(false);
    expect(() => root.root.findByProps({ testID: 'customise-save-unsaved-dot' })).toThrow();
  });

  it('plays equip cue only after EQUIP succeeds and shows Equipped flash', async () => {
    const { root, api } = await mountCustomise();

    const dagger = root.root.findByProps({ testID: 'customise-picker-card-weapon-dagger' });
    await act(async () => {
      dagger.props.onPress();
    });
    await flush();
    expect(playCue).toHaveBeenCalledWith('select');
    playCue.mockClear();

    const equip = root.root.findByProps({ testID: 'customise-save' });
    await act(async () => {
      equip.props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();

    expect(api().confirmedWeapon()).toBe('weapon-dagger');
    expect(api().dirty()).toBe(false);
    expect(playCue).toHaveBeenCalledWith('equip');
    expect(playCue).not.toHaveBeenCalledWith('select');

    const treeText = collectText(root.root).join(' ');
    expect(treeText).toMatch(/Equipped/i);
  });

  it('does not select locked Coming soon cards and keeps StatusErrorBanner for save fail', async () => {
    const { root, api } = await mountCustomise();
    const locked = root.root.findByProps({
      testID: `customise-picker-card-${COMING_SOON_WEAPONS[0]!.id}`,
    });
    expect(locked.props.accessibilityState.disabled).toBe(true);

    // Force save failure path via adapter through session after a change.
    // Re-mount with failing adapter.
    const auth = new DevAuthAdapter();
    await auth.signInWithPassword({ email: 'dev@botore.local', password: 'x' });
    const loadouts = new DevLoadoutSaveAdapter();
    loadouts.forceFailNext = true;
    const apiRef: { current: SessionProbe | null } = { current: null };

    let failRoot!: ReactTestRenderer;
    await act(async () => {
      failRoot = TestRenderer.create(
        <SafeAreaProvider>
          <GarageSessionProvider auth={auth} loadouts={loadouts}>
            <GarageProbe apiRef={apiRef} />
            <CustomiseScreen onBack={() => undefined} />
          </GarageSessionProvider>
        </SafeAreaProvider>,
      );
    });
    const failApi = () => {
      if (!apiRef.current) throw new Error('probe missing');
      return apiRef.current;
    };
    for (let i = 0; i < 40 && (failApi().booting() || !failApi().canProgress()); i += 1) {
      await flush();
    }

    await act(async () => {
      failApi().selectWeapon('weapon-axe');
    });
    await flush();
    const saveBtn = failRoot.root.findByProps({ testID: 'customise-save' });
    await act(async () => {
      saveBtn.props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();

    expect(failApi().lastError()).toMatch(/could not save changes/i);
    expect(failRoot.root.findByProps({ testID: 'customise-save-error' })).toBeTruthy();
    const text = collectText(failRoot.root).join(' ');
    expect(text).not.toMatch(/22023|PGRST|unpublished_atlas/i);
    void api;
  });
});
