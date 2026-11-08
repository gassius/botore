/**
 * Regression: psql|tee without pipefail can exit 0 when psql fails after
 * emitting all TEST-OK markers. CI must use set -o pipefail (see
 * scripts/run-db-tests-logged.sh).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MARKERS = [
  'TEST-OK seed fixtures',
  'TEST-OK backend health snapshot and admin views',
  'TEST-OK F4 admin APIs + backend_health_snapshot',
];

function runBash(script) {
  return spawnSync('bash', ['-c', script], { encoding: 'utf8' });
}

describe('pipefail preserves producer failure through tee', () => {
  it('without pipefail, producer exit 1 is masked by tee (documents the bug)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'botore-pipe-'));
    const log = join(dir, 'out.log');
    // bash -e alone does NOT fail the step when the left side of | fails.
    const res = runBash(`
      set -e
      ( ${MARKERS.map((m) => `echo '${m}'`).join('; ')}; exit 1 ) 2>&1 | tee '${log}'
      echo AFTER_PIPELINE
    `);
    assert.equal(res.status, 0, 'without pipefail the pipeline looks successful');
    assert.match(res.stdout, /AFTER_PIPELINE/);
    const body = readFileSync(log, 'utf8');
    for (const m of MARKERS) assert.ok(body.includes(m), m);
  });

  it('with pipefail, producer exit 1 fails even when all markers were teed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'botore-pipe-'));
    const log = join(dir, 'out.log');
    const res = runBash(`
      set -euo pipefail
      ( ${MARKERS.map((m) => `echo '${m}'`).join('; ')}; exit 1 ) 2>&1 | tee '${log}'
      echo SHOULD_NOT_REACH
    `);
    assert.notEqual(res.status, 0);
    assert.equal((res.stdout + res.stderr).includes('SHOULD_NOT_REACH'), false);
    const body = readFileSync(log, 'utf8');
    for (const m of MARKERS) assert.ok(body.includes(m), m);
  });

  it('run-db-tests-logged.sh declares pipefail', () => {
    const src = readFileSync(new URL('./run-db-tests-logged.sh', import.meta.url), 'utf8');
    assert.match(src, /set -euo pipefail/);
    assert.match(src, /\| tee /);
  });
});
