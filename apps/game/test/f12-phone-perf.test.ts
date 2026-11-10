import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOTORE_PERF_LOG_TAG,
  PHONE_PERF_THRESHOLDS,
  createFrameTimeSampler,
  formatPerfSummaryLog,
  isPerfSampleEnabled,
  readPerfLoadKind,
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
    expect(isPerfSampleEnabled(undefined)).toBe(false);
    expect(isPerfSampleEnabled('0')).toBe(false);
    expect(isPerfSampleEnabled('1')).toBe(true);
  });

  it('reads load kind only for warm|cold; unset omits load verdict', () => {
    expect(readPerfLoadKind(undefined)).toBeNull();
    expect(readPerfLoadKind('hot')).toBeNull();
    expect(readPerfLoadKind('warm')).toBe('warm');
    expect(readPerfLoadKind('cold')).toBe('cold');
  });

  it('keeps Expo public perf env reads as static process.env member expressions', () => {
    const source = readFileSync(join(process.cwd(), 'src/perf/thresholds.ts'), 'utf8');
    expect(source).toContain('process.env.EXPO_PUBLIC_PERF_SAMPLE');
    expect(source).toContain('process.env.EXPO_PUBLIC_PERF_LOAD_KIND');
    expect(source).not.toMatch(/process\.env\s*as\s*Record/);
    expect(source).not.toMatch(/process\.env\s*\[/);
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
    expect(summary.loadKind).toBe('warm');
    expect(summary.frameCount).toBe(3);
    expect(summary.p95Ms).toBeGreaterThan(0);
    expect(summary.hardSpikeCount).toBe(0);
    expect(summary.droppedFrameCount).toBe(0);
    expect(summary.passesProposedThresholds).toBe(true);
    expect(summary.failures).toEqual([]);
  });

  it('omits load verdict when loadKind is unset even if load ms is large', () => {
    const s = createFrameTimeSampler();
    s.markLoadStart(0);
    s.markPlayReady(5000);
    s.markPlaybackStart(5000);
    s.recordFrame(5016);
    s.recordFrame(5032);
    s.markPlaybackEnd(5100);

    const summary = summarizeFrameSample(s.snapshot(), undefined, { loadKind: null });
    expect(summary.loadToPlayReadyMs).toBe(5000);
    expect(summary.loadKind).toBeNull();
    expect(summary.failures.some((f) => f.startsWith('load_'))).toBe(false);
    expect(summary.passesProposedThresholds).toBe(true);
  });

  it('scores cold load against the cold budget', () => {
    const s = createFrameTimeSampler();
    s.markLoadStart(0);
    s.markPlayReady(2500);
    s.markPlaybackStart(2500);
    s.recordFrame(2516);
    s.recordFrame(2532);
    s.markPlaybackEnd(2600);

    const warm = summarizeFrameSample(s.snapshot(), undefined, { loadKind: 'warm' });
    expect(warm.failures.some((f) => f.includes('_warm'))).toBe(true);

    const cold = summarizeFrameSample(s.snapshot(), undefined, { loadKind: 'cold' });
    expect(cold.failures.some((f) => f.startsWith('load_'))).toBe(false);
    expect(cold.passesProposedThresholds).toBe(true);
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

  it('does not count a pause gap as a frame delta after pauseSampling', () => {
    const s = createFrameTimeSampler();
    s.markPlaybackStart(1000);
    s.recordFrame(1016);
    s.recordFrame(1032);
    s.pauseSampling();
    // 2s pause elapses; resume must re-baseline without a 2000ms spike.
    s.recordFrame(3032);
    s.recordFrame(3048);
    s.markPlaybackEnd(3100);

    expect(s.snapshot().deltasMs).toEqual([16, 16, 16]);
    const summary = summarizeFrameSample(s.snapshot());
    expect(summary.hardSpikeCount).toBe(0);
    expect(summary.droppedFrameCount).toBe(0);
  });

  it('starts a fresh sample on markPlaybackStart so mid-run Replay does not merge', () => {
    const s = createFrameTimeSampler();
    s.markPlaybackStart(0);
    s.recordFrame(16);
    s.recordFrame(32);
    // Operator hits Replay mid-run — new sample replaces the partial.
    s.markPlaybackStart(1000);
    s.recordFrame(1016);
    s.recordFrame(1032);
    s.markPlaybackEnd(1100);

    expect(s.snapshot().deltasMs).toEqual([16, 16]);
    expect(s.snapshot().startedAtMs).toBe(1000);
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
      loadKind: 'warm',
      passesProposedThresholds: true,
      failures: [],
    });
    expect(line.startsWith(BOTORE_PERF_LOG_TAG)).toBe(true);
    expect(line).toContain('"frameCount":2');
  });

  it('labels envelope / mute / reduced-motion honestly on the BotorePerf line', () => {
    const line = formatPerfSummaryLog(
      {
        frameCount: 1,
        p95Ms: 16,
        p99Ms: 16,
        hardSpikeCount: 0,
        droppedFrameCount: 0,
        droppedFrameRatio: 0,
        loadToPlayReadyMs: 100,
        loadKind: null,
        passesProposedThresholds: true,
        failures: [],
      },
      { envelope: 'live_sealed', muted: true, reducedMotion: true },
    );
    expect(line).toContain('"envelope":"live_sealed"');
    expect(line).toContain('"muted":true');
    expect(line).toContain('"reducedMotion":true');
  });
});
