/**
 * E6 / PRR B1: Opponents card must not alias Sir Bot onto a different A6 panel.
 */
import React, { act } from 'react';
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
    a6OpponentPanelForCandidate: (input: {
      characterId: string;
      displayName: string;
      paint: string;
      weapon: string;
    }) => {
      const id = match.matchA6OpponentPanelId(input);
      return id ? { uri: `a6-panel:${id}` } : null;
    },
  };
});

vi.mock('../src/bot/BotAssemblerSlot', () => ({
  BotAssemblerSlot: (props: {
    testID?: string;
    paintId?: string;
    weaponId?: string;
    size?: number;
  }) =>
    React.createElement('BotAssemblerSlot', {
      testID: props.testID ?? 'bot',
      paintId: props.paintId,
      weaponId: props.weaponId,
      size: props.size,
    }),
}));

vi.mock('../src/session-failure/useForcedSessionFailure', () => ({
  useForcedSessionFailure: () => null,
}));

vi.mock('../src/first-run/FirstRunContext', () => ({
  useFirstRun: () => ({
    muted: false,
    musicEnabled: true,
    effectsEnabled: true,
  }),
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

import TestRenderer, { ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  A6_OPPONENT_BAKES,
  a6NpcLoadoutMatchesBake,
  matchA6OpponentPanelId,
  resolveOpponentNpcId,
} from '../src/garage-tag/a6OpponentMatch';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import { GarageSessionProvider } from '../src/garage/LoadoutSessionContext';
import { DevLoadoutSaveAdapter } from '../src/garage/loadout/DevLoadoutSaveAdapter';
import {
  DEFAULT_CONFIRMED_LOADOUT,
  PROOF_ATLAS_VERSION,
} from '../src/garage/loadout/proofCatalogue';
import { DevOpponentCandidatesAdapter } from '../src/fight/candidates/DevOpponentCandidatesAdapter';
import type { ListCandidatesResult, OpponentCandidate } from '../src/fight/candidates/types';
import { FightSessionProvider } from '../src/fight/FightSessionContext';
import { OpponentsScreen } from '../src/fight/screens/OpponentsScreen';
import { DevFightRequestAdapter } from '../src/fight/request/DevFightRequestAdapter';
import {
  DevFightBackendState,
  resetSharedDevFightBackend,
} from '../src/fight/dev/DevFightBackendState';

afterEach(() => {
  resetSharedDevFightBackend(3);
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('E6 A6 opponent panel matching (B1)', () => {
  it('rejects display-name aliases onto a different NPC', () => {
    expect(resolveOpponentNpcId('Sir Bot')).toBeNull();
    expect(resolveOpponentNpcId('sir-bot')).toBeNull();
    expect(resolveOpponentNpcId('opp-sir-bot')).toBeNull();
    expect(resolveOpponentNpcId('Slab Mick')).toBe('slab-mick');
    expect(resolveOpponentNpcId('slab-mick')).toBe('slab-mick');
  });

  it('requires bake paint/weapon to match the candidate loadout', () => {
    const bake = A6_OPPONENT_BAKES['slab-mick'];
    expect(a6NpcLoadoutMatchesBake('paint-cinder', 'weapon-mace', bake)).toBe(true);
    expect(a6NpcLoadoutMatchesBake('cinder', 'mace', bake)).toBe(true);
    expect(a6NpcLoadoutMatchesBake('paint-cobalt', 'weapon-sword', bake)).toBe(false);
    expect(
      matchA6OpponentPanelId({
        characterId: 'slab-mick',
        displayName: 'Slab Mick',
        paint: 'paint-cinder',
        weapon: 'weapon-mace',
      }),
    ).toBe('slab-mick');
    expect(
      matchA6OpponentPanelId({
        characterId: 'opp-sir-bot',
        displayName: 'Sir Bot',
        paint: 'paint-cobalt',
        weapon: 'weapon-sword',
      }),
    ).toBeNull();
  });

  it('renders BotAssemblerSlot for Sir Bot cobalt/sword, not a panel Image', async () => {
    const backend = new DevFightBackendState(3);
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const sir: OpponentCandidate = {
      characterId: 'opp-sir-bot',
      displayName: 'Sir Bot',
      loadout: {
        ...DEFAULT_CONFIRMED_LOADOUT,
        paint: 'paint-cobalt',
        weapon: 'weapon-sword',
      },
      loadoutVersionId: 'dev-opp-sir',
      atlasVersion: PROOF_ATLAS_VERSION,
    };

    class SirOnlyCandidates extends DevOpponentCandidatesAdapter {
      override async listCandidates(): Promise<ListCandidatesResult> {
        const quota = this.backend.quota();
        return {
          ok: true,
          candidates: [sir],
          allowancesRemaining: quota.allowancesRemaining,
          utcDay: quota.utcDay,
          quota,
        };
      }
    }

    const candidates = new SirOnlyCandidates(backend);
    const fights = new DevFightRequestAdapter(backend);
    const loadouts = new DevLoadoutSaveAdapter();

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
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
      if (root.root.findAllByProps({ testID: 'opponent-preview-opp-sir-bot' }).length > 0) break;
    }

    const assemblers = root.root
      .findAllByProps({ testID: 'opponent-preview-opp-sir-bot' })
      .filter((n) => n.props.paintId === 'paint-cobalt' && n.props.weaponId === 'weapon-sword');
    expect(assemblers.length).toBeGreaterThanOrEqual(1);
    expect(assemblers[0]?.props.size).toBe(150);
    expect(root.root.findAllByProps({ testID: 'opponent-preview-panel-opp-sir-bot' })).toHaveLength(
      0,
    );
    const json = JSON.stringify(root.toJSON());
    expect(json).toContain('Sir Bot');
    expect(json).not.toContain('"Opponent"');
    expect(json).not.toContain('— W – — L');
  });

  it('renders three whole opponent cards at rest under the range counter', async () => {
    const backend = new DevFightBackendState(3);
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const candidates = new DevOpponentCandidatesAdapter(backend);
    const fights = new DevFightRequestAdapter(backend);
    const loadouts = new DevLoadoutSaveAdapter();

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
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
      if (root.root.findAllByProps({ testID: 'opponents-snap-list' }).length > 0) break;
    }

    expect(root.root.findAllByProps({ testID: 'opponents-range' }).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      root.root.findAllByProps({ testID: 'opponents-list-host' }).length,
    ).toBeGreaterThanOrEqual(1);
    const host = root.root.findByProps({ testID: 'opponents-list-host' });
    expect(host.props.style).toMatchObject({ minHeight: 545 });

    const cardIds = ['opp-dex-bot', 'opp-hp-bot', 'opp-sir-bot'];
    for (const id of cardIds) {
      expect(root.root.findAllByProps({ testID: `opponent-${id}` }).length).toBeGreaterThanOrEqual(
        1,
      );
    }
    const range = root.root.findByProps({ testID: 'opponents-range' });
    expect(JSON.stringify(range.props.children)).toContain('3');
    expect(JSON.stringify(root.toJSON())).toContain('Can Hook');
    expect(JSON.stringify(root.toJSON())).toContain('Cobalt Brute');
    expect(JSON.stringify(root.toJSON())).toContain('Slab Mick');
    expect(JSON.stringify(root.toJSON())).not.toContain('opponents-snap-hint');
  });
});
