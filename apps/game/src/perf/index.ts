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

/** Honest envelope provenance for R1 / F12 acceptance captures. */
export type PerfEnvelopeKind = 'live_sealed' | 'dev_fixture';

export type PerfSummaryLogMeta = {
  readonly envelope?: PerfEnvelopeKind;
  readonly muted?: boolean;
  readonly reducedMotion?: boolean;
};

export function formatPerfSummaryLog(
  summary: {
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
  },
  meta: PerfSummaryLogMeta = {},
): string {
  const payload = {
    ...summary,
    ...(meta.envelope !== undefined ? { envelope: meta.envelope } : {}),
    ...(meta.muted !== undefined ? { muted: meta.muted } : {}),
    ...(meta.reducedMotion !== undefined ? { reducedMotion: meta.reducedMotion } : {}),
  };
  return `${BOTORE_PERF_LOG_TAG} ${JSON.stringify(payload)}`;
}
