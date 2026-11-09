/**
 * Proposed Android phone performance limits for F12.
 * Mirror of docs/architecture/android-release-perf.md — agree on ClickUp
 * before treating measurements as acceptance. Not product-owner-approved yet.
 *
 * Expo inlines only static `process.env.EXPO_PUBLIC_*` member expressions.
 * Do not alias `process.env` or index it dynamically — those reads stay empty
 * in release bundles and the sampler would never enable.
 * @see https://docs.expo.dev/guides/environment-variables/#how-to-read-from-environment-variables
 */
export const PHONE_PERF_THRESHOLDS = {
  /** Warm load (packs cached) → Play-ready, milliseconds. */
  warmLoadToPlayReadyMs: 1000,
  /** Cold load (packs not cached) → Play-ready, milliseconds. */
  coldLoadToPlayReadyMs: 3000,
  /** Frame-time p95 during Play→END, milliseconds (60 Hz reference). */
  frameTimeP95Ms: 20,
  /** Frame-time p99 during Play→END, milliseconds. */
  frameTimeP99Ms: 33,
  /** A hard spike is any frame above this duration (ms). */
  hardSpikeMs: 33,
  /** Max hard spikes allowed per representative replay. */
  maxHardSpikes: 5,
  /** Dropped-frame threshold: dt above this counts as a drop (ms). */
  droppedFrameMs: 25,
  /** Max fraction of sampled frames that may be drops (0–1). */
  maxDroppedFrameRatio: 0.02,
  /** Reference vsync interval used for reporting (60 Hz). */
  referenceVsyncMs: 1000 / 60,
} as const;

export type PhonePerfThresholds = typeof PHONE_PERF_THRESHOLDS;

export type PerfLoadKind = 'warm' | 'cold';

/**
 * True when release/native sampling should run (explicit opt-in only).
 * Default arg uses a static Expo public env member so Metro can inline it.
 */
export function isPerfSampleEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_PERF_SAMPLE,
): boolean {
  return flag === '1';
}

/**
 * Cold/warm load scoring kind from the measurement harness.
 * Returns null when unset — load is reported but not verdicted.
 */
export function readPerfLoadKind(
  kind: string | undefined = process.env.EXPO_PUBLIC_PERF_LOAD_KIND,
): PerfLoadKind | null {
  if (kind === 'warm' || kind === 'cold') return kind;
  return null;
}
