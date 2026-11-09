/**
 * Records requestAnimationFrame deltas for phone perf validation.
 * Does not invent numbers — only stores timestamps the host feeds in.
 */

export type FrameTimeSample = {
  readonly deltasMs: readonly number[];
  readonly startedAtMs: number | null;
  readonly endedAtMs: number | null;
  readonly playReadyAtMs: number | null;
  readonly loadStartedAtMs: number | null;
};

export type FrameTimeSampler = {
  markLoadStart: (nowMs: number) => void;
  markPlayReady: (nowMs: number) => void;
  markPlaybackStart: (nowMs: number) => void;
  recordFrame: (nowMs: number) => void;
  markPlaybackEnd: (nowMs: number) => void;
  reset: () => void;
  snapshot: () => FrameTimeSample;
};

export function createFrameTimeSampler(): FrameTimeSampler {
  let loadStartedAtMs: number | null = null;
  let playReadyAtMs: number | null = null;
  let startedAtMs: number | null = null;
  let endedAtMs: number | null = null;
  let lastFrameMs: number | null = null;
  const deltasMs: number[] = [];

  return {
    markLoadStart(nowMs) {
      loadStartedAtMs = nowMs;
      playReadyAtMs = null;
    },
    markPlayReady(nowMs) {
      if (playReadyAtMs === null) playReadyAtMs = nowMs;
    },
    markPlaybackStart(nowMs) {
      startedAtMs = nowMs;
      endedAtMs = null;
      lastFrameMs = nowMs;
      deltasMs.length = 0;
    },
    recordFrame(nowMs) {
      if (startedAtMs === null || endedAtMs !== null) return;
      if (lastFrameMs !== null) {
        const dt = nowMs - lastFrameMs;
        if (dt >= 0) deltasMs.push(dt);
      }
      lastFrameMs = nowMs;
    },
    markPlaybackEnd(nowMs) {
      endedAtMs = nowMs;
    },
    reset() {
      loadStartedAtMs = null;
      playReadyAtMs = null;
      startedAtMs = null;
      endedAtMs = null;
      lastFrameMs = null;
      deltasMs.length = 0;
    },
    snapshot() {
      return {
        deltasMs: deltasMs.slice(),
        startedAtMs,
        endedAtMs,
        playReadyAtMs,
        loadStartedAtMs,
      };
    },
  };
}
