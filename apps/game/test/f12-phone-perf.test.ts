import { describe, expect, it } from 'vitest';
import {
  BOTORE_PERF_LOG_TAG,
  PHONE_PERF_THRESHOLDS,
  createFrameTimeSampler,
  formatPerfSummaryLog,
  isPerfSampleEnabled,
  summarizeFrameSample,
} from '../src/perf';

describe('F12 phone perf thresholds (proposed)', () => {
  it('exposes the written proposal constants used for agreement', () => {
    expect(PHONE_PERF_THRESHOLDS.warmLoadToPlayReadyMs).toBe(1000);
    expect(PHONE_PERF_THRESHOLDS.coldLoadToPlayReadyMs).toBe(3000);
    expect(PHONE_PERF_THRESHOLDS.frameTimeP95Ms).toBe(20);
    expect(PHONE_PERF_THRESHOLDS.frameTimeP99Ms).toBe(33);
    expect(PHONE_PERF_THRESHOLDS.hardSpikeMs).toBe(33);
    expect(PHONE_PERF_THRESHOLDS.maxHardSpikes).toBe(5);
    expect(PHONE_PERF_THRESHOLDS.droppedFrameMs).toBe(25);
    expect(PHONE_PERF_THRESHOLDS.maxDroppedFrameRatio).toBe(0.02);
  });

  it('enables sampling only via explicit EXPO_PUBLIC_PERF_SAMPLE=1', () => {
    expect(isPerfSampleEnabled({})).toBe(false);
    expect(isPerfSampleEnabled({ EXPO_PUBLIC_PERF_SAMPLE: '0' })).toBe(false);
    expect(isPerfSampleEnabled({ EXPO_PUBLIC_PERF_SAMPLE: '1' })).toBe(true);
  });
});

describe('F12 frame-time sampler + summary', () => {
  it('records load-to-play-ready and frame deltas without inventing values', () => {
    const s = createFrameTimeSampler();
    s.markLoadStart(1000);
    s.markPlayReady(1400);
    s.markPlaybackStart(1500);
    s.recordFrame(1516);
    s.recordFrame(1533);
    s.recordFrame(1550);
    s.markPlaybackEnd(1600);

    const snap = s.snapshot();
    expect(snap.loadStartedAtMs).toBe(1000);
    expect(snap.playReadyAtMs).toBe(1400);
    expect(snap.deltasMs).toEqual([16, 17, 17]);

    const summary = summarizeFrameSample(snap, undefined, { loadKind: 'warm' });
    expect(summary.loadToPlayReadyMs).toBe(400);
    expect(summary.frameCount).toBe(3);
    expect(summary.p95Ms).toBeGreaterThan(0);
    expect(summary.hardSpikeCount).toBe(0);
    expect(summary.droppedFrameCount).toBe(0);
    expect(summary.passesProposedThresholds).toBe(true);
    expect(summary.failures).toEqual([]);
  });

  it('flags hard spikes, drops, and load over budget against proposed limits', () => {
    const s = createFrameTimeSampler();
    s.markLoadStart(0);
    s.markPlayReady(2500); // warm budget is 1000ms
    s.markPlaybackStart(3000);
    // Mostly fine frames, then spikes/drops
    for (let i = 0; i < 20; i += 1) s.recordFrame(3000 + (i + 1) * 16);
    s.recordFrame(3000 + 20 * 16 + 40); // hard spike + drop
    s.recordFrame(3000 + 20 * 16 + 40 + 50); // another
    s.recordFrame(3000 + 20 * 16 + 40 + 50 + 45); // another
    s.recordFrame(3000 + 20 * 16 + 40 + 50 + 45 + 40); // another
    s.recordFrame(3000 + 20 * 16 + 40 + 50 + 45 + 40 + 40); // another → 5 spikes
    s.recordFrame(3000 + 20 * 16 + 40 + 50 + 45 + 40 + 40 + 40); // 6th spike
    s.markPlaybackEnd(5000);

    const summary = summarizeFrameSample(s.snapshot(), undefined, { loadKind: 'warm' });
    expect(summary.hardSpikeCount).toBeGreaterThan(PHONE_PERF_THRESHOLDS.maxHardSpikes);
    expect(summary.droppedFrameCount).toBeGreaterThan(0);
    expect(summary.passesProposedThresholds).toBe(false);
    expect(summary.failures.some((f) => f.startsWith('load_'))).toBe(true);
    expect(summary.failures.some((f) => f.startsWith('hard_spikes_'))).toBe(true);
  });

  it('returns null pass when no frames were sampled', () => {
    const summary = summarizeFrameSample(createFrameTimeSampler().snapshot());
    expect(summary.passesProposedThresholds).toBeNull();
    expect(summary.failures).toEqual(['no_frames_sampled']);
  });

  it('formats a stable BotorePerf log line for adb logcat capture', () => {
    const line = formatPerfSummaryLog({
      frameCount: 2,
      p95Ms: 18,
      p99Ms: 19,
      hardSpikeCount: 0,
      droppedFrameCount: 0,
      droppedFrameRatio: 0,
      loadToPlayReadyMs: 200,
      passesProposedThresholds: true,
      failures: [],
    });
    expect(line.startsWith(BOTORE_PERF_LOG_TAG)).toBe(true);
    expect(line).toContain('"frameCount":2');
  });
});
