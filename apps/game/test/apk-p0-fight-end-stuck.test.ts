/**
 * APK P0 — fight end stuck after final strike (Carlos, botore-main-4035ad7).
 *
 * Root cause under test: advancing onto the last command (victory_screen) via
 * `playbackUiAfterAdvance` flips `playing: false`. CanonicalReplayPlayer's rAF
 * effect is gated on `playbackUi.playing`, so the loop tears down before
 * last-command dwell and `onFinished` — Result overlay never mounts, first-watch
 * band has no Back to Ludus / Replay, fight stays frozen at KO.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createOnceHandoff, shouldScheduleKoHandoff } from '../src/fight-view/fightViewNavigation';
import { FIGHT_VIEW_KO_HOLD_MS } from '../src/fight-view/types';
import {
  initialPlaybackUi,
  playbackUiAfterAdvance,
  playbackUiAfterCommandTick,
  resumeState,
  shouldContinuePlaybackLoopAfterTick,
} from '../src/replay/playbackControl';
import { commandDuration } from '../src/replay-playback';
import {
  reduceResultOverlayShell,
  type ResultOverlayShellState,
} from '../src/result-overlay/resultOverlayShell';

function readSource(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

describe('APK P0 — last-command dwell must not tear down the fight loop', () => {
  it('playbackUiAfterAdvance still clears playing at end (progress contract)', () => {
    let state = resumeState(initialPlaybackUi(3));
    state = playbackUiAfterAdvance(state, 3);
    expect(state.commandIndex).toBe(3);
    expect(state.progress).toBe(1);
    expect(state.playing).toBe(false);
  });

  it('command tick keep-alive stays playing through the final command dwell', () => {
    let state = resumeState(initialPlaybackUi(3));
    state = playbackUiAfterCommandTick(state, 2);
    expect(state.playing).toBe(true);
    expect(state.commandIndex).toBe(2);

    // Land on the end — progress complete, but playing must stay true so the
    // rAF effect is not cleaned up before victory_screen dwell + onFinished.
    state = playbackUiAfterCommandTick(state, 3);
    expect(state.commandIndex).toBe(3);
    expect(state.progress).toBe(1);
    expect(state.playing).toBe(true);
  });

  it('mid-fight FX pause still stops the loop; final dwell continues', () => {
    expect(
      shouldContinuePlaybackLoopAfterTick({
        finished: false,
        playing: false,
        nowMs: 100,
        waitUntilMs: 50,
      }),
    ).toBe('stop');

    expect(
      shouldContinuePlaybackLoopAfterTick({
        finished: true,
        playing: true,
        nowMs: 100,
        waitUntilMs: 200,
      }),
    ).toBe('wait');

    expect(
      shouldContinuePlaybackLoopAfterTick({
        finished: true,
        playing: true,
        nowMs: 200,
        waitUntilMs: 200,
      }),
    ).toBe('finish');

    expect(
      shouldContinuePlaybackLoopAfterTick({
        finished: false,
        playing: true,
        nowMs: 200,
        waitUntilMs: 200,
      }),
    ).toBe('advance');
  });

  it('victory_screen dwell + KO hold reaches Result overlay, then Ludus / Watch again', () => {
    vi.useFakeTimers();
    const firstWatch: ResultOverlayShellState = {
      route: 'Replay',
      fightViewMode: 'firstWatch',
      showResultOverlay: false,
    };

    // Simulate CanonicalReplayPlayer: last command applied, keep-alive playing,
    // wait out victory_screen, then onFinished → KO hold → overlay.
    let ui = resumeState(initialPlaybackUi(1));
    ui = playbackUiAfterCommandTick(ui, 1);
    expect(ui.playing).toBe(true);

    const victoryMs = commandDuration({ kind: 'victory_screen', winner: 'player-hero' });
    expect(victoryMs).toBe(800);

    let phase: 'dwell' | 'ko_hold' | 'overlay' = 'dwell';
    const openOverlay = createOnceHandoff(() => {
      phase = 'overlay';
    });
    expect(shouldScheduleKoHandoff('firstWatch')).toBe(true);

    // After dwell, player calls onFinished → schedule KO hold.
    expect(
      shouldContinuePlaybackLoopAfterTick({
        finished: true,
        playing: true,
        nowMs: victoryMs,
        waitUntilMs: victoryMs,
      }),
    ).toBe('finish');
    phase = 'ko_hold';
    const koTimer = setTimeout(openOverlay, FIGHT_VIEW_KO_HOLD_MS);

    vi.advanceTimersByTime(FIGHT_VIEW_KO_HOLD_MS - 1);
    expect(phase).toBe('ko_hold');
    vi.advanceTimersByTime(1);
    expect(phase).toBe('overlay');
    clearTimeout(koTimer);
    vi.useRealTimers();

    const open = reduceResultOverlayShell(firstWatch, { type: 'ko_handoff' });
    expect(open.showResultOverlay).toBe(true);
    expect(reduceResultOverlayShell(open, { type: 'go_stable' })).toEqual({
      route: 'Stable',
      fightViewMode: 'firstWatch',
      showResultOverlay: false,
    });
    expect(reduceResultOverlayShell(open, { type: 'watch_again' })).toEqual({
      route: 'Replay',
      fightViewMode: 'rewatch',
      showResultOverlay: false,
    });
  });
});

describe('APK P0 — player + overlay wiring guards', () => {
  it('CanonicalReplayPlayer keeps the loop alive through final dwell before onFinished', () => {
    const player = readSource('src/replay/CanonicalReplayPlayer.tsx');
    expect(player).toContain('playbackUiAfterCommandTick');
    expect(player).toContain('shouldContinuePlaybackLoopAfterTick');
    // Must not emit plain after-advance on the tick path (that clears playing at end).
    expect(player).not.toMatch(
      /emitPlayback\(\s*playbackUiAfterAdvance\(playbackUiRef\.current,\s*pb\.position\)\s*\)/,
    );
  });

  it('Result overlay content is box-none; action band stays above the arena for taps', () => {
    const overlay = readSource('src/result-overlay/ResultOverlay.tsx');
    expect(overlay).toMatch(/testID=\{`\$\{testID\}-content`\}[\s\S]*?pointerEvents="box-none"/);
    const slot = readSource('src/first-run/slots/ReplaySlot.tsx');
    expect(slot).toMatch(/styles\.band[\s\S]*?zIndex:\s*1[0-9]/);
    const band = readSource('src/result-overlay/ResultOverlayBand.tsx');
    expect(band).toContain('result-stable');
    expect(band).toContain('result-watch');
    expect(band).toContain('onBackToStable');
    expect(band).toContain('onWatchAgain');
  });
});
