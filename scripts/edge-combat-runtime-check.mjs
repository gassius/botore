#!/usr/bin/env node
/**
 * F2 Edge combat runtime gate wrapper.
 *
 * 1) Ensures vendored pure packages exist
 * 2) Runs Deno tests against the shipped Edge handler path
 *    (frozen golden checksum + auth/eligibility failures)
 *
 * Usage: node scripts/edge-combat-runtime-check.mjs
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'supabase/functions/_shared/botore');
const denoTestDir = join(root, 'supabase/functions/combat-v1');

/** Frozen vector from packages/combat-engine golden snapshot — must not drift. */
const FROZEN_CHECKSUM = 'd2a7c18d60ac6f5b27fcd9cfb4f183905e9c95c2b0cb8b1983549b57e8d49e2f';

function fail(msg) {
  console.error(`EDGE-RUNTIME FAIL: ${msg}`);
  process.exit(1);
}

if (!existsSync(join(vendor, 'combat-engine/index.js'))) {
  console.log('==> vendoring edge combat packages first');
  const res = spawnSync(process.execPath, [join(root, 'scripts/vendor-edge-combat.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (res.status !== 0) fail('vendor-edge-combat failed');
}

// Resolve deno binary (CI installs via denoland/setup-deno; local may have it).
function findDeno() {
  const which = spawnSync('deno', ['--version'], { encoding: 'utf8' });
  if (which.status === 0) return 'deno';
  return null;
}

const deno = findDeno();
if (!deno) {
  fail(
    'deno not found on PATH — install Deno (CI: denoland/setup-deno) to run the Edge runtime gate',
  );
}

console.log('==> deno test Edge combat-v1 handler (frozen golden + auth/eligibility)');
const test = spawnSync(deno, ['test', '-A', '--quiet', join(denoTestDir, 'handler_test.ts')], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    // Make frozen checksum available if tests want to cross-check env.
    BOTORE_FROZEN_GOLDEN_CHECKSUM: FROZEN_CHECKSUM,
  },
});
if (test.stdout) process.stdout.write(test.stdout);
if (test.stderr) process.stderr.write(test.stderr);
if (test.status !== 0) fail(`deno test failed with status ${test.status}`);

console.log(
  JSON.stringify(
    {
      runtime: 'deno',
      handler: 'supabase/functions/combat-v1/handler.ts',
      frozenChecksum: FROZEN_CHECKSUM,
      gate: 'handler_test.ts',
    },
    null,
    2,
  ),
);
console.log('EDGE-RUNTIME-OK combat-v1 Deno handler + frozen golden');
