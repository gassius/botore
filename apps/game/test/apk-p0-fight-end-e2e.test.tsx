/**
 * APK P0 E2E — after KO overlay mounts, Back to Ludus and Watch again fire.
 * Headless RN TestRenderer (no WebView); mirrors live ReplaySlot band wiring.
 */
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
    Pressable: make('Pressable'),
    StyleSheet: { create: (s: object) => s, absoluteFillObject: {} },
    Platform: { OS: 'android' },
  };
});

vi.mock('../src/garage-tag', () => ({
  garageTag: {
    cream: '#f5ead2',
    graphite: '#1e1c18',
    mustard: '#e3b341',
    mustardPressed: '#c9962a',
    paper: '#efe4cc',
  },
  uiKitAssets: { glyphReplay: { uri: 'glyph-replay' } },
}));

import TestRenderer, { ReactTestRenderer, act } from 'react-test-renderer';
import { createOnceHandoff, shouldScheduleKoHandoff } from '../src/fight-view/fightViewNavigation';
import { FIGHT_VIEW_KO_HOLD_MS } from '../src/fight-view/types';
import {
  initialPlaybackUi,
  playbackUiAfterCommandTick,
  resumeState,
  shouldContinuePlaybackLoopAfterTick,
} from '../src/replay/playbackControl';
import { commandDuration } from '../src/replay-playback';
import { ResultOverlayBand } from '../src/result-overlay/ResultOverlayBand';
import {
  reduceResultOverlayShell,
  type ResultOverlayShellState,
} from '../src/result-overlay/resultOverlayShell';

function findByTestId(root: ReactTestRenderer, testID: string) {
  return root.root.findByProps({ testID });
}

describe('APK P0 E2E — play to KO then Back to Ludus / Watch again', () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer!.unmount();
      });
      renderer = null;
    }
    vi.useRealTimers();
  });

  it('finishes victory_screen dwell, opens overlay, taps Back to Ludus and Watch again', () => {
    vi.useFakeTimers();

    // 1) Playback reaches final command without tearing down the loop.
    let ui = resumeState(initialPlaybackUi(1));
    ui = playbackUiAfterCommandTick(ui, 1);
    expect(ui.playing).toBe(true);
    const victoryMs = commandDuration({ kind: 'victory_screen', winner: 'player-hero' });
    expect(
      shouldContinuePlaybackLoopAfterTick({
        finished: true,
        playing: true,
        nowMs: victoryMs,
        waitUntilMs: victoryMs,
      }),
    ).toBe('finish');

    // 2) onFinished → KO hold → overlay (first watch only).
    expect(shouldScheduleKoHandoff('firstWatch')).toBe(true);
    let shell: ResultOverlayShellState = {
      route: 'Replay',
      fightViewMode: 'firstWatch',
      showResultOverlay: false,
    };
    const openOnce = createOnceHandoff(() => {
      shell = reduceResultOverlayShell(shell, { type: 'ko_handoff' });
    });
    setTimeout(openOnce, FIGHT_VIEW_KO_HOLD_MS);
    vi.advanceTimersByTime(FIGHT_VIEW_KO_HOLD_MS);
    expect(shell.showResultOverlay).toBe(true);
    expect(shell.route).toBe('Replay');

    // 3) Band actions — same handlers ReplaySlot wires after KO.
    const onBackToStable = vi.fn(() => {
      shell = reduceResultOverlayShell(shell, { type: 'go_stable' });
    });
    const onWatchAgain = vi.fn(() => {
      shell = reduceResultOverlayShell(shell, { type: 'watch_again' });
    });
    const onRanking = vi.fn();

    act(() => {
      renderer = TestRenderer.create(
        <ResultOverlayBand
          onBackToStable={onBackToStable}
          onWatchAgain={onWatchAgain}
          onRanking={onRanking}
        />,
      );
    });

    act(() => {
      findByTestId(renderer!, 'result-stable').props.onPress();
    });
    expect(onBackToStable).toHaveBeenCalledTimes(1);
    expect(shell).toEqual({
      route: 'Stable',
      fightViewMode: 'firstWatch',
      showResultOverlay: false,
    });

    // Re-open overlay and tap Watch again (Replay).
    shell = reduceResultOverlayShell(
      { route: 'Replay', fightViewMode: 'firstWatch', showResultOverlay: false },
      { type: 'ko_handoff' },
    );
    act(() => {
      findByTestId(renderer!, 'result-watch').props.onPress();
    });
    expect(onWatchAgain).toHaveBeenCalledTimes(1);
    expect(shell).toEqual({
      route: 'Replay',
      fightViewMode: 'rewatch',
      showResultOverlay: false,
    });

    // No player-facing ids in band labels.
    const stableLabel = findByTestId(renderer!, 'result-stable').props.accessibilityLabel;
    const watchLabel = findByTestId(renderer!, 'result-watch').props.accessibilityLabel;
    expect(stableLabel).toBe('Back to Ludus');
    expect(watchLabel).toBe('Watch again');
    expect(String(stableLabel)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(String(watchLabel)).not.toMatch(/battle|checksum|uuid/i);
  });
});
