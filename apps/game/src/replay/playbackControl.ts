/**
 * Pure playback UI state for shell ↔ CanonicalReplayPlayer wiring.
 * Supports pause/resume, progress, and restart of the same replay queue.
 */

export type PlaybackUiState = {
  readonly playing: boolean;
  readonly progress: number;
  readonly commandIndex: number;
  readonly totalCommands: number;
};

export function initialPlaybackUi(totalCommands: number): PlaybackUiState {
  return {
    playing: false,
    progress: 0,
    commandIndex: 0,
    totalCommands: Math.max(0, totalCommands),
  };
}

export function progressFromPosition(commandIndex: number, totalCommands: number): number {
  if (totalCommands <= 0) return 1;
  return Math.max(0, Math.min(1, commandIndex / totalCommands));
}

export function playbackUiAfterAdvance(prev: PlaybackUiState, nextIndex: number): PlaybackUiState {
  const finished = nextIndex >= prev.totalCommands;
  return {
    ...prev,
    commandIndex: nextIndex,
    progress: progressFromPosition(nextIndex, prev.totalCommands),
    playing: finished ? false : prev.playing,
  };
}

/**
 * rAF tick emit after applying a command.
 * When the advance lands on/past the final command, keep `playing: true` so the
 * effect that owns the loop is not torn down before last-command dwell and
 * `onFinished`. Plain `playbackUiAfterAdvance` clears playing at end for progress
 * UI — that caused the APK P0 fight-end stuck (KO with no Result overlay).
 */
export function playbackUiAfterCommandTick(
  prev: PlaybackUiState,
  nextIndex: number,
): PlaybackUiState {
  const next = playbackUiAfterAdvance(prev, nextIndex);
  if (nextIndex >= prev.totalCommands && prev.playing) {
    return { ...next, playing: true };
  }
  return next;
}

export type PlaybackLoopTickDecision = 'wait' | 'advance' | 'finish' | 'stop';

/**
 * Decide the next rAF action after a tick gate.
 * Final-command dwell must continue (`wait` → `finish`) even though progress is
 * already complete; mid-fight FX pause still returns `stop`.
 */
export function shouldContinuePlaybackLoopAfterTick(opts: {
  readonly finished: boolean;
  readonly playing: boolean;
  readonly nowMs: number;
  readonly waitUntilMs: number;
}): PlaybackLoopTickDecision {
  if (opts.nowMs < opts.waitUntilMs) {
    if (opts.playing || opts.finished) return 'wait';
    return 'stop';
  }
  if (opts.finished) return 'finish';
  if (!opts.playing) return 'stop';
  return 'advance';
}

export function togglePlayState(prev: PlaybackUiState): PlaybackUiState {
  if (prev.progress >= 1 || prev.commandIndex >= prev.totalCommands) {
    return { ...prev, playing: false, progress: 1 };
  }
  return { ...prev, playing: !prev.playing };
}

export function pauseState(prev: PlaybackUiState): PlaybackUiState {
  return { ...prev, playing: false };
}

export function resumeState(prev: PlaybackUiState): PlaybackUiState {
  if (prev.commandIndex >= prev.totalCommands) return { ...prev, playing: false };
  return { ...prev, playing: true };
}

export function restartState(totalCommands: number): PlaybackUiState {
  return {
    playing: true,
    progress: 0,
    commandIndex: 0,
    totalCommands: Math.max(0, totalCommands),
  };
}

/**
 * Same-tick emit helper for the rAF loop: keep a mutable ref in sync so a
 * pause/resume inside `onFxCue` (or any listener) wins before the next emit.
 * Returns whether the playback loop should schedule another frame.
 */
export function emitPlaybackUi(
  ref: { current: PlaybackUiState },
  next: PlaybackUiState,
): { readonly state: PlaybackUiState; readonly shouldContinue: boolean } {
  ref.current = next;
  return { state: next, shouldContinue: next.playing };
}
