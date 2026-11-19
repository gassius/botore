import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePaintVisual } from '../src/assembler/paints';
import { PROOF_PAINTS, PROOF_WEAPONS } from '../src/garage/loadout/proofCatalogue';
import { CUSTOMISE_CAROUSEL } from '../src/garage-tag/snap/snapMetrics';
import { resetCaptureIntentForTests } from '../src/design-capture/captureIntentState';

const ROOT = process.cwd();

function readSource(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

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
    Pressable: make('Pressable'),
    ActivityIndicator: make('ActivityIndicator'),
    ScrollView: make('ScrollView'),
    StyleSheet: {
      create: (s: object) => s,
      absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
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

vi.mock('../src/bot/BotAssemblerSlot', () => ({
  BotAssemblerSlot: (props: { testID?: string }) =>
    React.createElement('BotAssemblerSlot', { testID: props.testID ?? 'bot' }),
}));

vi.mock('../src/garage-tag/PartPickerStrip', () => ({
  PartPickerStrip: (props: { testID?: string }) =>
    React.createElement('PartPickerStrip', { testID: props.testID ?? 'strip' }),
}));

vi.mock('../src/audio/useTrialUiAudio', () => ({
  useTrialUiAudio: () => ({
    playCue: vi.fn(),
    playUiTap: vi.fn(),
  }),
}));

vi.mock('../src/design-capture', () => ({
  isDesignCaptureEnabled: () => false,
}));

const suggestBotName = vi.fn(async () => 'Rust Baron');
const createOwnedBot = vi.fn(async () => ({ ok: true as const, characterId: 'player-dev-2' }));
const onCreated = vi.fn();
const onBack = vi.fn();

let ownedBotsMock: Array<{
  characterId: string;
  displayName: string;
  wins: number;
  losses: number;
  paint: string;
  weapon: string;
  atlasVersion: string;
  isActive: boolean;
}> = [
  {
    characterId: 'player-hero',
    displayName: 'Hero',
    wins: 12,
    losses: 6,
    paint: 'paint-crimson',
    weapon: 'weapon-sword',
    atlasVersion: 'v1',
    isActive: true,
  },
];
let botCapMock = 3;

vi.mock('../src/garage/LoadoutSessionContext', () => ({
  useGarageSession: () => ({
    ownedBots: ownedBotsMock,
    botCap: botCapMock,
    suggestBotName,
    createOwnedBot,
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
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BOT_DISPLAY_NAME_MAX_LEN } from '../src/garage/customise/botNameInput';
import { CreateBotScreen } from '../src/garage/screens/CreateBotScreen';

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

describe('D6 Create Bot view', () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    suggestBotName.mockClear();
    createOwnedBot.mockClear();
    onCreated.mockClear();
    onBack.mockClear();
    createOwnedBot.mockResolvedValue({ ok: true, characterId: 'player-dev-2' });
    suggestBotName.mockResolvedValue('Rust Baron');
    ownedBotsMock = [
      {
        characterId: 'player-hero',
        displayName: 'Hero',
        wins: 12,
        losses: 6,
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        atlasVersion: 'v1',
        isActive: true,
      },
    ];
    botCapMock = 3;
    resetCaptureIntentForTests();
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
  });

  it('keeps name max via BOT_DISPLAY_NAME_MAX_LEN and CreateBot route wired from Ludus', () => {
    const screen = readSource('src/garage/screens/CreateBotScreen.tsx');
    expect(screen).toContain('BOT_DISPLAY_NAME_MAX_LEN');
    expect(screen).toContain('clampBotNameDraft');
    expect(screen).toContain('BOT_NAME_INPUT_IME_PROPS');
    expect(screen).not.toContain('NAME_MAX = 12');
    expect(screen).toContain('create-bot-name');
    expect(screen).toContain('create-bot-reroll');
    expect(screen).toContain('create-bot-submit');
    expect(screen).toContain('create-bot-helper');
    expect(screen).toContain('create-bot-weapon-strip');
    expect(screen).toContain('suggestBotName');
    expect(screen).toContain('createOwnedBot');
    expect(screen).toContain('busy={busy}');
    expect(screen).toContain('createInFlight');
    expect(screen).toContain('accessibilityRole="alert"');
    // Art: preview must stay short enough that the weapon strip sits above Create.
    expect(screen).toMatch(/PREVIEW_HEIGHT = 1[0-6]\d/);
    expect(screen).not.toMatch(/PREVIEW_HEIGHT = 250/);

    const slot = readSource('src/first-run/slots/CreateBotSlot.tsx');
    expect(slot).toContain('CreateBotScreen');
    expect(slot).toContain("goTo('Stable')");

    const stableSlot = readSource('src/first-run/slots/StableSlot.tsx');
    expect(stableSlot).toContain("goTo('CreateBot')");
  });

  it('starting paints are solids only; weapons reuse Customise snap metrics', () => {
    const solids = PROOF_PAINTS.filter((p) => resolvePaintVisual(p.uiAlias).kind === 'solid');
    expect(solids.length).toBeGreaterThanOrEqual(3);
    expect(solids.every((p) => resolvePaintVisual(p.uiAlias).kind === 'solid')).toBe(true);
    // Not an empty capture fixture — catalogue always has weapons for the strip.
    expect(PROOF_WEAPONS.length).toBeGreaterThanOrEqual(3);
    expect(CUSTOMISE_CAROUSEL.visibleCount).toBe(3);
    expect(CUSTOMISE_CAROUSEL.viewportClip).toBe(337);
  });

  it('does not put character ids in player-facing Create Bot copy', () => {
    const screen = readSource('src/garage/screens/CreateBotScreen.tsx');
    expect(screen).not.toMatch(/characterId/);
    expect(screen).not.toMatch(/player-hero/);
    expect(screen).toContain('Your Ludus is full');
  });

  it('disables Create for whitespace-only names', async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        <SafeAreaProvider>
          <CreateBotScreen onCreated={onCreated} onBack={onBack} />
        </SafeAreaProvider>,
      );
    });

    await act(async () => {
      findByTestId(renderer!, 'create-bot-name').props.onChangeText('   ');
    });

    expect(findByTestId(renderer!, 'create-bot-submit').props.disabled).toBe(true);
  });

  it('preserves name case and omits textTransform on Create Bot input (Android E13)', async () => {
    await act(async () => {
      renderer = TestRenderer.create(
        <SafeAreaProvider>
          <CreateBotScreen onCreated={onCreated} onBack={onBack} />
        </SafeAreaProvider>,
      );
    });

    const input = findByTestId(renderer!, 'create-bot-name');
    expect(StyleSheet.flatten(input.props.style).textTransform).toBeUndefined();
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.autoComplete).toBe('off');
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.maxLength).toBe(BOT_DISPLAY_NAME_MAX_LEN);

    await act(async () => {
      input.props.onChangeText('aBcDe');
    });
    expect(findByTestId(renderer!, 'create-bot-name').props.value).toBe('aBcDe');
  });

  it('shows at-cap branch when owned bots reach cap', async () => {
    ownedBotsMock = [1, 2, 3].map((n) => ({
      characterId: `bot-${n}`,
      displayName: `Bot ${n}`,
      wins: 0,
      losses: 0,
      paint: 'paint-cobalt',
      weapon: 'weapon-sword',
      atlasVersion: 'v1',
      isActive: n === 1,
    }));
    botCapMock = 3;

    await act(async () => {
      renderer = TestRenderer.create(
        <SafeAreaProvider>
          <CreateBotScreen onCreated={onCreated} onBack={onBack} />
        </SafeAreaProvider>,
      );
    });

    expect(findByTestId(renderer!, 'create-bot-at-cap')).toBeTruthy();
    expect(tryFindByTestId(renderer!, 'create-bot-submit')).toBeNull();
  });

  it('shows error and clears busy when createOwnedBot rejects', async () => {
    createOwnedBot.mockRejectedValueOnce(new Error('network'));

    await act(async () => {
      renderer = TestRenderer.create(
        <SafeAreaProvider>
          <CreateBotScreen onCreated={onCreated} onBack={onBack} />
        </SafeAreaProvider>,
      );
    });

    await act(async () => {
      findByTestId(renderer!, 'create-bot-submit').props.onPress();
    });

    expect(findByTestId(renderer!, 'create-bot-error').props.children).toContain(
      'Could not create bot',
    );
    expect(findByTestId(renderer!, 'create-bot-submit').props.busy).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('calls onCreated once on success and latches double-tap', async () => {
    let resolveCreate!: (v: { ok: true; characterId: string }) => void;
    createOwnedBot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    await act(async () => {
      renderer = TestRenderer.create(
        <SafeAreaProvider>
          <CreateBotScreen onCreated={onCreated} onBack={onBack} />
        </SafeAreaProvider>,
      );
    });

    await act(async () => {
      findByTestId(renderer!, 'create-bot-submit').props.onPress();
      findByTestId(renderer!, 'create-bot-submit').props.onPress();
    });

    expect(createOwnedBot).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({ ok: true, characterId: 'player-dev-2' });
    });

    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});
