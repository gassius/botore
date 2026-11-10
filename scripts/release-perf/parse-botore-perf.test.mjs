import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BOTORE_PERF_LOG_TAG,
  buildPassRecord,
  extractBotorePerfPayloads,
  main,
} from './parse-botore-perf.mjs';
import { PHONE_PERF_THRESHOLDS, verdictSummary } from './thresholds.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');

describe('release-perf thresholds mirror', () => {
  it('matches apps/game/src/perf/thresholds.ts numeric proposal', () => {
    const src = readFileSync(join(repoRoot, 'apps/game/src/perf/thresholds.ts'), 'utf8');
    for (const [key, value] of Object.entries(PHONE_PERF_THRESHOLDS)) {
      if (key === 'referenceVsyncMs') {
        assert.match(src, /referenceVsyncMs:\s*1000\s*\/\s*60/);
        continue;
      }
      assert.match(src, new RegExp(`${key}:\\s*${value}`), `missing ${key}=${value}`);
    }
  });
});

describe('extractBotorePerfPayloads', () => {
  it('pulls JSON from noisy logcat lines', () => {
    const dump = [
      '11-10 10:00:00.000  123  456 I ReactNativeJS: hello',
      `11-10 10:00:01.000  123  456 I ReactNativeJS: ${BOTORE_PERF_LOG_TAG} {"frameCount":10,"p95Ms":17.5,"p99Ms":19,"hardSpikeCount":0,"droppedFrameCount":0,"droppedFrameRatio":0,"loadToPlayReadyMs":400,"loadKind":null,"passesProposedThresholds":true,"failures":[],"envelope":"live_sealed","muted":false,"reducedMotion":false}`,
      'noise',
    ].join('\n');
    const payloads = extractBotorePerfPayloads(dump);
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].summary.envelope, 'live_sealed');
    assert.equal(payloads[0].summary.frameCount, 10);
  });
});

describe('verdictSummary + buildPassRecord', () => {
  it('applies operator load-kind when binary left loadKind null', () => {
    const summary = {
      frameCount: 5,
      p95Ms: 16,
      p99Ms: 17,
      hardSpikeCount: 0,
      droppedFrameCount: 0,
      droppedFrameRatio: 0,
      loadToPlayReadyMs: 2500,
      loadKind: null,
      envelope: 'live_sealed',
    };
    const warm = verdictSummary(summary, { loadKind: 'warm' });
    assert.equal(warm.passesProposedThresholds, false);
    assert.ok(warm.failures.some((f) => f.includes('_warm')));

    const cold = verdictSummary(summary, { loadKind: 'cold' });
    assert.equal(cold.passesProposedThresholds, true);

    const record = buildPassRecord(summary, {
      loadKind: 'cold',
      requireEnvelope: 'live_sealed',
      passId: 'sound-on-cold',
    });
    assert.equal(record.ok, true);
    assert.equal(record.passId, 'sound-on-cold');
    assert.equal(record.verdict.passesProposedThresholds, true);
  });

  it('rejects wrong envelope when required', () => {
    const record = buildPassRecord(
      {
        frameCount: 2,
        p95Ms: 16,
        p99Ms: 16,
        hardSpikeCount: 0,
        droppedFrameCount: 0,
        droppedFrameRatio: 0,
        loadToPlayReadyMs: 100,
        envelope: 'dev_fixture',
      },
      { requireEnvelope: 'live_sealed' },
    );
    assert.equal(record.ok, false);
    assert.match(record.error, /dev_fixture/);
  });
});

describe('parse-botore-perf main', () => {
  it('emits the last BotorePerf line and exits 0 on pass', () => {
    const dump = [
      `${BOTORE_PERF_LOG_TAG} {"frameCount":1,"p95Ms":50,"p99Ms":50,"hardSpikeCount":0,"droppedFrameCount":1,"droppedFrameRatio":1,"loadToPlayReadyMs":10,"failures":[],"envelope":"live_sealed"}`,
      `${BOTORE_PERF_LOG_TAG} {"frameCount":8,"p95Ms":16,"p99Ms":17,"hardSpikeCount":0,"droppedFrameCount":0,"droppedFrameRatio":0,"loadToPlayReadyMs":200,"failures":[],"envelope":"live_sealed","muted":true}`,
    ].join('\n');
    let out = '';
    const code = main(
      ['--load-kind', 'warm', '--require-envelope', 'live_sealed', '--pass-id', 'muted-warm'],
      {
        readStdin: () => dump,
        log: (s) => {
          out += s;
        },
        err: () => undefined,
      },
    );
    assert.equal(code, 0);
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.summary.muted, true);
    assert.equal(parsed.summary.frameCount, 8);
  });
});
