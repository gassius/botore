import { PHONE_PERF_THRESHOLDS, type PerfLoadKind, type PhonePerfThresholds } from './thresholds';
import type { FrameTimeSample } from './frameTimeSampler';

export type FrameSampleSummary = {
  readonly frameCount: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
  readonly maxMs: number | null;
  readonly hardSpikeCount: number;
  readonly droppedFrameCount: number;
  readonly droppedFrameRatio: number | null;
  readonly loadToPlayReadyMs: number | null;
  readonly loadKind: PerfLoadKind | null;
  readonly playbackDurationMs: number | null;
  readonly passesProposedThresholds: boolean | null;
  readonly failures: readonly string[];
};

function percentile(sortedAsc: readonly number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo]!;
  const w = rank - lo;
  return sortedAsc[lo]! * (1 - w) + sortedAsc[hi]! * w;
}

export function summarizeFrameSample(
  sample: FrameTimeSample,
  thresholds: PhonePerfThresholds = PHONE_PERF_THRESHOLDS,
  opts: { readonly loadKind?: PerfLoadKind | null } = {},
): FrameSampleSummary {
  const sorted = [...sample.deltasMs].sort((a, b) => a - b);
  const frameCount = sorted.length;
  const p50Ms = percentile(sorted, 50);
  const p95Ms = percentile(sorted, 95);
  const p99Ms = percentile(sorted, 99);
  const maxMs = frameCount > 0 ? sorted[frameCount - 1]! : null;
  const hardSpikeCount = sorted.filter((dt) => dt > thresholds.hardSpikeMs).length;
  const droppedFrameCount = sorted.filter((dt) => dt > thresholds.droppedFrameMs).length;
  const droppedFrameRatio = frameCount > 0 ? droppedFrameCount / frameCount : null;
  const loadKind = opts.loadKind ?? null;

  const loadToPlayReadyMs =
    sample.loadStartedAtMs !== null && sample.playReadyAtMs !== null
      ? Math.max(0, sample.playReadyAtMs - sample.loadStartedAtMs)
      : null;
  const playbackDurationMs =
    sample.startedAtMs !== null && sample.endedAtMs !== null
      ? Math.max(0, sample.endedAtMs - sample.startedAtMs)
      : null;

  const failures: string[] = [];
  if (frameCount === 0) {
    return {
      frameCount,
      p50Ms,
      p95Ms,
      p99Ms,
      maxMs,
      hardSpikeCount,
      droppedFrameCount,
      droppedFrameRatio,
      loadToPlayReadyMs,
      loadKind,
      playbackDurationMs,
      passesProposedThresholds: null,
      failures: ['no_frames_sampled'],
    };
  }

  if (p95Ms !== null && p95Ms > thresholds.frameTimeP95Ms) {
    failures.push(`p95_${p95Ms.toFixed(1)}_gt_${thresholds.frameTimeP95Ms}`);
  }
  if (p99Ms !== null && p99Ms > thresholds.frameTimeP99Ms) {
    failures.push(`p99_${p99Ms.toFixed(1)}_gt_${thresholds.frameTimeP99Ms}`);
  }
  if (hardSpikeCount > thresholds.maxHardSpikes) {
    failures.push(`hard_spikes_${hardSpikeCount}_gt_${thresholds.maxHardSpikes}`);
  }
  if (droppedFrameRatio !== null && droppedFrameRatio > thresholds.maxDroppedFrameRatio) {
    failures.push(
      `dropped_ratio_${droppedFrameRatio.toFixed(4)}_gt_${thresholds.maxDroppedFrameRatio}`,
    );
  }
  // Load is only verdicted when the harness declares warm/cold; otherwise report only.
  if (loadToPlayReadyMs !== null && loadKind !== null) {
    const loadLimit =
      loadKind === 'cold' ? thresholds.coldLoadToPlayReadyMs : thresholds.warmLoadToPlayReadyMs;
    if (loadToPlayReadyMs > loadLimit) {
      failures.push(`load_${loadToPlayReadyMs}_gt_${loadLimit}_${loadKind}`);
    }
  }

  return {
    frameCount,
    p50Ms,
    p95Ms,
    p99Ms,
    maxMs,
    hardSpikeCount,
    droppedFrameCount,
    droppedFrameRatio,
    loadToPlayReadyMs,
    loadKind,
    playbackDurationMs,
    passesProposedThresholds: failures.length === 0,
    failures,
  };
}
