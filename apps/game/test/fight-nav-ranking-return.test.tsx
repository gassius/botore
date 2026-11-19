/**
 * Ranking opened from the end-of-fight Result returns to that Result
 * (in-arena overlay on Replay), not Ludus. Ranking from Ludus still returns to Ludus.
 * Covers header Back and Android hardware Back through the real FirstRunProvider.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { backListeners, rankingProps } = vi.hoisted(() => ({
  backListeners: [] as Array<() => boolean>,
  rankingProps: { current: null as null | { onBack?: () => void } },
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

vi.mock('../src/design-capture/captureEnv', () => ({
  rankingTabForCaptureScenario: () => 'bots',
}));

vi.mock('../src/garage/LoadoutSessionContext', () => ({
  useGarageSession: () => ({ session: null, signOut: async () => undefined }),
}));

vi.mock('../src/screens/RankingScreen', () => ({
  RankingScreen: (props: { onBack?: () => void }) => {
    rankingProps.current = props;
    return null;
  },
}));

import TestRenderer, { act } from 'react-test-renderer';
import { rankingReturnTargetFor, resolveRankingExit } from '../src/fight-view/fightViewNavigation';
import {
  FirstRunProvider,
  useFirstRun,
  type FirstRunContextValue,
} from '../src/first-run/FirstRunContext';
import { RankingSlot } from '../src/first-run/slots/RankingSlot';
import { formatCaptureNavLog } from '../src/design-capture/useDesignCaptureNavLog';

describe('ranking return target (pure)', () => {
  it('Result overlay on Replay returns to the overlay', () => {
    expect(rankingReturnTargetFor('Replay', true)).toBe('resultOverlay');
    expect(resolveRankingExit('resultOverlay')).toEqual({
      route: 'Replay',
      showResultOverlay: true,
    });
  });

  it('capture FightResult route returns to FightResult', () => {
    expect(rankingReturnTargetFor('FightResult', false)).toBe('FightResult');
    expect(resolveRankingExit('FightResult').route).toBe('FightResult');
  });

  it('Ludus / mid-fight / other routes return to Ludus', () => {
    expect(rankingReturnTargetFor('Stable', false)).toBe('Stable');
    expect(rankingReturnTargetFor('Replay', false)).toBe('Stable');
    expect(rankingReturnTargetFor('Settings', false)).toBe('Stable');
    expect(resolveRankingExit('Stable')).toEqual({ route: 'Stable', showResultOverlay: false });
  });
});

describe('capture nav marker (Android CI landing assert)', () => {
  it('formats route + overlay for logcat grep', () => {
    expect(formatCaptureNavLog('Replay', true)).toBe('BOTORE_CAPTURE_NAV:route=Replay overlay=1');
    expect(formatCaptureNavLog('Stable', false)).toBe('BOTORE_CAPTURE_NAV:route=Stable overlay=0');
  });
});

describe('FirstRunProvider — Ranking back after a fight', () => {
  let ctx: FirstRunContextValue | null = null;
  let renderer: TestRenderer.ReactTestRenderer | null = null;

  function Probe(): React.ReactElement | null {
    ctx = useFirstRun();
    return ctx.route === 'Ranking' ? <RankingSlot /> : null;
  }

  beforeEach(() => {
    backListeners.length = 0;
    rankingProps.current = null;
    act(() => {
      renderer = TestRenderer.create(
        <FirstRunProvider>
          <Probe />
        </FirstRunProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
    ctx = null;
  });

  function openResultThenRanking(mode: 'firstWatch' | 'rewatch' = 'firstWatch') {
    act(() => ctx!.goTo('ConfirmFight'));
    act(() => ctx!.setFightViewMode(mode));
    act(() => ctx!.goTo('Replay'));
    act(() => ctx!.setShowResultOverlay(true));
    act(() => ctx!.goTo('Ranking'));
    expect(ctx!.route).toBe('Ranking');
    expect(ctx!.showResultOverlay).toBe(false);
  }

  it('header Back from Ranking lands on the end-of-fight Result, not Ludus', () => {
    openResultThenRanking();
    act(() => rankingProps.current!.onBack!());
    expect(ctx!.route).toBe('Replay');
    expect(ctx!.showResultOverlay).toBe(true);
    expect(ctx!.fightViewMode).toBe('firstWatch');
  });

  it('Android hardware Back from Ranking lands on the Result', () => {
    openResultThenRanking('rewatch');
    expect(backListeners).toHaveLength(1);
    let handled = false;
    act(() => {
      handled = backListeners[backListeners.length - 1]!();
    });
    expect(handled).toBe(true);
    expect(ctx!.route).toBe('Replay');
    expect(ctx!.showResultOverlay).toBe(true);
    expect(ctx!.fightViewMode).toBe('rewatch');
    // RankingSlot unmounted → listener removed (no stale back routing).
    expect(backListeners).toHaveLength(0);
  });

  it('shell goBack on Ranking uses the same return target', () => {
    openResultThenRanking();
    act(() => ctx!.goBack());
    expect(ctx!.route).toBe('Replay');
    expect(ctx!.showResultOverlay).toBe(true);
  });

  it('Ranking → Result → Back to Ludus → Ranking returns to Ludus', () => {
    openResultThenRanking();
    act(() => rankingProps.current!.onBack!());
    act(() => ctx!.goTo('Stable'));
    act(() => ctx!.goTo('Ranking'));
    act(() => rankingProps.current!.onBack!());
    expect(ctx!.route).toBe('Stable');
    expect(ctx!.showResultOverlay).toBe(false);
  });

  it('Ranking from Ludus still returns to Ludus', () => {
    act(() => ctx!.goTo('Ranking'));
    act(() => rankingProps.current!.onBack!());
    expect(ctx!.route).toBe('Stable');
    expect(ctx!.showResultOverlay).toBe(false);
  });
});
