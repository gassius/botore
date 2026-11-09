export {
  PHONE_PERF_THRESHOLDS,
  isPerfSampleEnabled,
  readPerfLoadKind,
  type PerfLoadKind,
  type PhonePerfThresholds,
} from './thresholds';
export {
  createFrameTimeSampler,
  type FrameTimeSample,
  type FrameTimeSampler,
} from './frameTimeSampler';
export { summarizeFrameSample, type FrameSampleSummary } from './summarizeSample';

/** Stable logcat / Metro tag for release measurement capture. */
export const BOTORE_PERF_LOG_TAG = 'BotorePerf';

export function formatPerfSummaryLog(summary: {
  readonly frameCount: number;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
  readonly hardSpikeCount: number;
  readonly droppedFrameCount: number;
  readonly droppedFrameRatio: number | null;
  readonly loadToPlayReadyMs: number | null;
  readonly loadKind?: string | null;
  readonly passesProposedThresholds: boolean | null;
  readonly failures: readonly string[];
}): string {
  return `${BOTORE_PERF_LOG_TAG} ${JSON.stringify(summary)}`;
}
