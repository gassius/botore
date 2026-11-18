/**
 * D3: Customise one screen — bigger robot, horizontal picker, EQUIP copy, cues.
 * Phone frame 390×844; no vertical scroll; C17 no player-facing ids.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

let forcedSessionFailure: 'offline' | 'auth_expired' | null = null;

vi.mock('../src/session-failure/useForcedSessionFailure', () => ({
  useForcedSessionFailure: () => forcedSessionFailure,
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
import { garageTag } from '../src/garage-tag';
import {
  CUSTOMISE_BOT_SIZE,
  CUSTOMISE_STAGE_HEIGHT,
  CUSTOMISE_STAGE_MIN_HEIGHT,
  COMING_SOON_WEAPONS,
  buildWeaponPickerCards,
} from '../src/garage/customise/customiseSlots';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import { GarageSessionProvider, useGarageSession } from '../src/garage/LoadoutSessionContext';
import { DevLoadoutSaveAdapter } from '../src/garage/loadout/DevLoadoutSaveAdapter';
import { CustomiseScreen } from '../src/garage/screens/CustomiseScreen';
import { SESSION_FAILURE_COPY } from '../src/session-failure';

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
  signOut: () => Promise<void>;
  retryHydration: () => Promise<void>;
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
    signOut: () => garage.signOut(),
    retryHydration: () => garage.retryHydration(),
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

function buttonLabel(root: TestRenderer.ReactTestInstance, testID: string): string {
  const node = root.findByProps({ testID });
  // Deduplicate mocked RN Text walk (collectText can visit the same string twice).
  const unique = [
    ...new Set(
      collectText(node)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  return unique[0] ?? '';
}

async function mountCustomise(opts?: {
  auth?: DevAuthAdapter;
  loadouts?: DevLoadoutSaveAdapter;
}): Promise<{
  root: ReactTestRenderer;
  api: () => SessionProbe;
  auth: DevAuthAdapter;
  loadouts: DevLoadoutSaveAdapter;
}> {
  const auth = opts?.auth ?? new DevAuthAdapter();
  if (!opts?.auth) {
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);
  }

  const loadouts = opts?.loadouts ?? new DevLoadoutSaveAdapter();
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
  return { root, api, auth, loadouts };
}

beforeEach(() => {
  forcedSessionFailure = null;
  playCue.mockReset();
});

afterEach(() => {
  forcedSessionFailure = null;
  vi.restoreAllMocks();
});

describe('D3 Customise one screen (390×844)', () => {
  it('keeps a non-scroll body viewport usable with real-ish insets + flex stage', () => {
    // iPhone-like top inset 47 / bottom 34 → chrome safe padding still 10 in ScreenChrome.
    const layout = measureScreenChromeLayout({
      fillInner: true,
      viewportHeight: 844,
      safePadding: 10,
      panelBorder: 3,
      innerPadding: 16,
      footerHeight: 120, // Discard+EQUIP row + optional session action
      contentHeight: 700,
      scrollMode: false,
    });
    expect(layout.frameHeight).toBe(824);
    expect(layout.scrollViewportHeight).toBeGreaterThan(500);
    expect(layout.footerRetained).toBe(true);
    // Flex stage budget: max 410, min 300 — shrinks before banners/footer clip.
    expect(CUSTOMISE_STAGE_HEIGHT).toBe(410);
    expect(CUSTOMISE_STAGE_MIN_HEIGHT).toBe(300);
    expect(CUSTOMISE_STAGE_MIN_HEIGHT).toBeLessThan(CUSTOMISE_STAGE_HEIGHT);
  });

  it('renders one-screen layout: flex stage, tabs, strip, EQUIP — no Confirmed/UNSAVED', async () => {
    const { root, api } = await mountCustomise();

    expect(root.root.findByProps({ testID: 'customise-body' })).toBeTruthy();
    expect(root.root.findByProps({ testID: 'customise-actions' })).toBeTruthy();

    const stage = root.root.findByProps({ testID: 'customise-stage' });
    expect(stage.props.style).toEqual(
      expect.objectContaining({
        flexGrow: 1,
        flexShrink: 1,
        minHeight: CUSTOMISE_STAGE_MIN_HEIGHT,
        maxHeight: CUSTOMISE_STAGE_HEIGHT,
      }),
    );

    const bot = root.root.findByProps({ testID: 'customise-bot' });
    expect(bot.props.size).toBe(CUSTOMISE_BOT_SIZE);

    for (const id of ['paint', 'head', 'body', 'arms', 'legs', 'weapon'] as const) {
      expect(root.root.findByProps({ testID: `customise-tabs-${id}` })).toBeTruthy();
    }
    const headTab = root.root.findByProps({ testID: 'customise-tabs-head' });
    expect(headTab.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(headTab.props.hitSlop).toEqual({ top: 5, bottom: 5, left: 0, right: 0 });
    expect(
      root.root.findByProps({ testID: 'customise-tabs-weapon' }).props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true, disabled: false }));

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
    expect(buttonLabel(root.root, 'customise-save')).toBe('Equip');
    expect(buttonLabel(root.root, 'customise-discard')).toBe('Discard');
    expect(treeText).toMatch(/Coming soon/i);

    expect(api().dirty()).toBe(false);
    expect(() => root.root.findByProps({ testID: 'customise-save-unsaved-dot' })).toThrow();
    expect(root.root.findByProps({ testID: 'customise-save' }).props.disabled).toBe(true);

    const axeCard = root.root.findByProps({ testID: 'customise-picker-card-weapon-axe' });
    await act(async () => {
      axeCard.props.onPress();
    });
    await flush();
    expect(api().dirty()).toBe(true);
    expect(playCue).toHaveBeenCalledWith('select');
    expect(playCue).toHaveBeenCalledTimes(1);
    expect(root.root.findByProps({ testID: 'customise-save-unsaved-dot' })).toBeTruthy();
    expect(root.root.findByProps({ testID: 'customise-save' }).props.disabled).toBe(false);

    const discard = root.root.findByProps({ testID: 'customise-discard' });
    await act(async () => {
      discard.props.onPress();
    });
    await flush();
    expect(api().dirty()).toBe(false);
    expect(() => root.root.findByProps({ testID: 'customise-save-unsaved-dot' })).toThrow();
  });

  it('plays equip cue once after EQUIP succeeds; stays disabled during Equipped flash', async () => {
    const { root, api } = await mountCustomise();

    const dagger = root.root.findByProps({ testID: 'customise-picker-card-weapon-dagger' });
    await act(async () => {
      dagger.props.onPress();
    });
    await flush();
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
    expect(playCue).toHaveBeenCalledTimes(1);
    expect(buttonLabel(root.root, 'customise-save')).toBe('Equipped');
    // Flash must not re-enable a clean Equip (PRR minor 2).
    expect(root.root.findByProps({ testID: 'customise-save' }).props.disabled).toBe(true);

    // Dirty during flash ends flash early and shows the Oxide dot.
    await act(async () => {
      root.root.findByProps({ testID: 'customise-picker-card-weapon-axe' }).props.onPress();
    });
    await flush();
    expect(api().dirty()).toBe(true);
    expect(buttonLabel(root.root, 'customise-save')).toBe('Equip');
    expect(root.root.findByProps({ testID: 'customise-save-unsaved-dot' })).toBeTruthy();
  });

  it('auth_expired session action signs out from ready Customise', async () => {
    forcedSessionFailure = 'auth_expired';
    const { root, auth } = await mountCustomise();
    expect(await auth.getSession()).not.toBeNull();

    expect(root.root.findByProps({ testID: 'customise-session-auth_expired' })).toBeTruthy();
    const action = root.root.findByProps({ testID: 'customise-session-action' });
    expect(buttonLabel(root.root, 'customise-session-action')).toBe(
      SESSION_FAILURE_COPY.auth_expired.actionLabel,
    );

    await act(async () => {
      action.props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(await auth.getSession()).toBeNull();
  });

  it('offline session action retries hydrate when clean, and saves when dirty', async () => {
    forcedSessionFailure = 'offline';
    const { root, api, loadouts } = await mountCustomise();
    const fetchSpy = vi.spyOn(loadouts, 'fetchCurrent');

    const action = root.root.findByProps({ testID: 'customise-session-action' });
    expect(buttonLabel(root.root, 'customise-session-action')).toBe(
      SESSION_FAILURE_COPY.offline.actionLabel,
    );

    await act(async () => {
      action.props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(fetchSpy).toHaveBeenCalled();

    fetchSpy.mockClear();
    await act(async () => {
      api().selectWeapon('weapon-axe');
    });
    await flush();
    expect(api().dirty()).toBe(true);

    await act(async () => {
      root.root.findByProps({ testID: 'customise-session-action' }).props.onPress();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    // Dirty offline action path calls Equip/save (not hydrate).
    expect(api().dirty()).toBe(false);
    expect(api().confirmedWeapon()).toBe('weapon-axe');
    expect(playCue).toHaveBeenCalledWith('equip');
  });

  it('does not select locked Coming soon cards; StatusErrorBanner on save fail', async () => {
    const { root } = await mountCustomise();
    const locked = root.root.findByProps({
      testID: `customise-picker-card-${COMING_SOON_WEAPONS[0]!.id}`,
    });
    expect(locked.props.accessibilityState.disabled).toBe(true);

    const auth = new DevAuthAdapter();
    await auth.signInWithPassword({ email: 'dev@botore.local', password: 'x' });
    const loadouts = new DevLoadoutSaveAdapter();
    loadouts.forceFailNext = true;
    const { root: failRoot, api: failApi } = await mountCustomise({ auth, loadouts });

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
  });

  it('keeps shared TabBar default touchMin when compact is off', () => {
    // Compact is Customise-only; default consumers keep ≥48pt minHeight.
    expect(garageTag.touchMin).toBe(48);
  });
});
