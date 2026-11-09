/**
 * Proposed Android phone performance limits for F12.
 * Mirror of docs/architecture/android-release-perf.md — agree on ClickUp
 * before treating measurements as acceptance. Not product-owner-approved yet.
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

/** True when release/native sampling should run (explicit opt-in only). */
export function isPerfSampleEnabled(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  return env.EXPO_PUBLIC_PERF_SAMPLE === '1';
}
