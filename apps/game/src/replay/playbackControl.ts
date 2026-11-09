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
