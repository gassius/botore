/**
 * Mirror of apps/game/src/perf/thresholds.ts / docs/architecture/android-release-perf.md.
 * Keep in lockstep — parse-botore-perf.test.mjs asserts equality with the TS source.
 */
export const PHONE_PERF_THRESHOLDS = Object.freeze({
  warmLoadToPlayReadyMs: 1000,
  coldLoadToPlayReadyMs: 3000,
  frameTimeP95Ms: 20,
  frameTimeP99Ms: 33,
  hardSpikeMs: 33,
  maxHardSpikes: 5,
  droppedFrameMs: 25,
  maxDroppedFrameRatio: 0.02,
  referenceVsyncMs: 1000 / 60,
});

/**
 * Re-score a BotorePerf summary payload against proposed thresholds.
 * When `loadKind` is provided, load ms is verdicted even if the binary left
 * EXPO_PUBLIC_PERF_LOAD_KIND unset (operator-declared warm/cold pass).
 */
export function verdictSummary(summary, opts = {}) {
  const thresholds = opts.thresholds ?? PHONE_PERF_THRESHOLDS;
  const loadKind = opts.loadKind ?? summary.loadKind ?? null;
  const failures = [];

  const frameCount = Number(summary.frameCount ?? 0);
  if (!Number.isFinite(frameCount) || frameCount <= 0) {
    return {
      loadKind,
      passesProposedThresholds: null,
      failures: ['no_frames_sampled'],
    };
  }

  const p95Ms = summary.p95Ms;
  const p99Ms = summary.p99Ms;
  if (typeof p95Ms === 'number' && p95Ms > thresholds.frameTimeP95Ms) {
    failures.push(`p95_${p95Ms.toFixed(1)}_gt_${thresholds.frameTimeP95Ms}`);
  }
  if (typeof p99Ms === 'number' && p99Ms > thresholds.frameTimeP99Ms) {
    failures.push(`p99_${p99Ms.toFixed(1)}_gt_${thresholds.frameTimeP99Ms}`);
  }

  const hardSpikeCount = Number(summary.hardSpikeCount ?? 0);
  if (hardSpikeCount > thresholds.maxHardSpikes) {
    failures.push(`hard_spikes_${hardSpikeCount}_gt_${thresholds.maxHardSpikes}`);
  }

  const droppedFrameRatio =
    typeof summary.droppedFrameRatio === 'number'
      ? summary.droppedFrameRatio
      : summary.droppedFrameCount != null && frameCount > 0
        ? Number(summary.droppedFrameCount) / frameCount
        : null;
  if (
    typeof droppedFrameRatio === 'number' &&
    droppedFrameRatio > thresholds.maxDroppedFrameRatio
  ) {
    failures.push(
      `dropped_ratio_${droppedFrameRatio.toFixed(4)}_gt_${thresholds.maxDroppedFrameRatio}`,
    );
  }

  const loadToPlayReadyMs =
    typeof summary.loadToPlayReadyMs === 'number' ? summary.loadToPlayReadyMs : null;
  if (loadToPlayReadyMs !== null && (loadKind === 'warm' || loadKind === 'cold')) {
    const loadLimit =
      loadKind === 'cold' ? thresholds.coldLoadToPlayReadyMs : thresholds.warmLoadToPlayReadyMs;
    if (loadToPlayReadyMs > loadLimit) {
      failures.push(`load_${loadToPlayReadyMs}_gt_${loadLimit}_${loadKind}`);
    }
  }

  return {
    loadKind,
    passesProposedThresholds: failures.length === 0,
    failures,
  };
}
