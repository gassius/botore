/**
 * Carlos APK gaps: Opponents/Customise Back → Ludus; Ludus card refreshes after Equip.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { backListeners } = vi.hoisted(() => ({
  backListeners: [] as Array<() => boolean>,
}));

vi.mock('react-native', () => ({
  BackHandler: {
    addEventListener: (_event: string, cb: () => boolean) => {
      backListeners.push(cb);
      return {
        remove: () => {
          const i = backListeners.indexOf(cb);
          if (i >= 0) backListeners.splice(i, 1);
        },
      };
    },
  },
}));

vi.mock('../src/fight-view', async () => import('../src/fight-view/fightViewNavigation'));

vi.mock('../src/settings', () => ({
  usePlayerSettings: () => ({
    muted: false,
    setMuted: () => undefined,
    toggleMute: () => undefined,
    musicEnabled: true,
    setMusicEnabled: () => undefined,
    effectsEnabled: true,
    setEffectsEnabled: () => undefined,
    reducedMotion: false,
    forceReducedMotion: false,
    setForceReducedMotion: () => undefined,
    osReducedMotion: false,
    hydrated: true,
  }),
}));

vi.mock('../src/design-capture', () => ({
  readDesignCaptureConfig: () => ({}),
  readDesignCaptureSessionFailure: () => null,
}));

vi.mock('../src/design-capture/pendingCaptureIntent', () => ({
  peekCaptureIntent: () => ({}),
}));

vi.mock('../src/fight/screens/OpponentsScreen', () => ({
  OpponentsScreen: (props: { onBack?: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const R = require('react') as typeof import('react');
    return R.createElement('OpponentsScreen', props);
  },
}));

vi.mock('../src/garage/screens/CustomiseScreen', () => ({
  CustomiseScreen: (props: { onBack?: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const R = require('react') as typeof import('react');
    return R.createElement('CustomiseScreen', props);
  },
}));

import TestRenderer, { act } from 'react-test-renderer';
import { applyLoadoutToOwnedBots } from '../src/garage/loadout/applyLoadoutToOwnedBots';
import type { OwnedBotSummary } from '../src/garage/loadout/loadoutTypes';
import {
  FirstRunProvider,
  useFirstRun,
  type FirstRunContextValue,
} from '../src/first-run/FirstRunContext';
import { OpponentsSlot } from '../src/first-run/slots/OpponentsSlot';
import { CustomiseSlot } from '../src/first-run/slots/CustomiseSlot';
import { prevRoute } from '../src/first-run/routes';
import { resolveFirstRunGoBackTarget } from '../src/fight-view/fightViewNavigation';

let ctx: FirstRunContextValue | null = null;

function Probe(): null {
  ctx = useFirstRun();
  return null;
}

beforeEach(() => {
  backListeners.length = 0;
  ctx = null;
});

afterEach(() => {
  backListeners.length = 0;
  ctx = null;
});

describe('Ludus nav — Opponents / Customise Back', () => {
  it('header + hardware Back from Opponents land on Ludus (Stable)', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <FirstRunProvider>
          <Probe />
          <OpponentsSlot />
        </FirstRunProvider>,
      );
    });

    act(() => ctx!.goTo('Opponents'));
    expect(ctx!.route).toBe('Opponents');
    expect(prevRoute('Opponents')).toBe('Stable');
    expect(resolveFirstRunGoBackTarget('Opponents', 'firstWatch', prevRoute('Opponents'))).toBe(
      'Stable',
    );

    act(() => ctx!.goBack());
    expect(ctx!.route).toBe('Stable');

    act(() => ctx!.goTo('Opponents'));
    expect(backListeners.length).toBeGreaterThan(0);
    act(() => {
      backListeners[backListeners.length - 1]!();
    });
    expect(ctx!.route).toBe('Stable');

    // Visiting Customise first must not trap Opponents under it.
    act(() => {
      ctx!.goTo('Customise');
      ctx!.goTo('Opponents');
    });
    act(() => ctx!.goBack());
    expect(ctx!.route).toBe('Stable');

    tree.unmount();
  });

  it('header + hardware Back from Customise land on Ludus (Stable)', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <FirstRunProvider>
          <Probe />
          <CustomiseSlot />
        </FirstRunProvider>,
      );
    });

    act(() => ctx!.goTo('Customise'));
    expect(ctx!.route).toBe('Customise');
    act(() => ctx!.goBack());
    expect(ctx!.route).toBe('Stable');

    act(() => ctx!.goTo('Customise'));
    expect(backListeners.length).toBeGreaterThan(0);
    act(() => {
      backListeners[backListeners.length - 1]!();
    });
    expect(ctx!.route).toBe('Stable');

    tree.unmount();
  });
});

describe('Ludus card freshness after Equip', () => {
  it('applyLoadoutToOwnedBots updates paint/weapon/shapes on the same bot', () => {
    const bots: OwnedBotSummary[] = [
      {
        characterId: 'bot-1',
        displayName: 'GEAR LANCE',
        wins: 1,
        losses: 0,
        paint: 'paint-navy',
        weapon: 'weapon-sword',
        head: 'head-visor',
        body: 'body-chassis',
        arms: 'arms-stock',
        legs: 'legs-stock',
        atlasVersion: 'v1',
        isActive: true,
      },
    ];
    const next = applyLoadoutToOwnedBots(
      bots,
      'bot-1',
      {
        paint: 'paint-navy',
        weapon: 'weapon-spear',
        head: 'head-visor',
        body: 'body-chassis',
        arms: 'arms-stock',
        legs: 'legs-stock',
      },
      'v1',
    );
    expect(next[0]?.weapon).toBe('weapon-spear');
    expect(next[0]?.paint).toBe('paint-navy');
    expect(next[0]?.characterId).toBe('bot-1');
  });
});
