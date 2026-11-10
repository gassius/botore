#!/usr/bin/env node
/**
 * B1 Edge Function coverage gate (real Deno coverage — not invented metrics).
 *
 * Runs Deno tests for combat-v1 + health with --coverage, then enforces a
 * line/branch/function threshold on the shipped handler sources via
 * `deno coverage --threshold`.
 *
 * Usage: node scripts/edge-coverage-gate.mjs
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'supabase/functions/_shared/botore');

/** Meaningful floor on Edge handler sources (measured against current suite). */
const THRESHOLD = 75;

const TARGETS = [
  {
    name: 'combat-v1',
    dir: join(root, 'supabase/functions/combat-v1'),
    include: '.*/supabase/functions/combat-v1/handler\\.ts$',
  },
  {
    name: 'health',
    dir: join(root, 'supabase/functions/health'),
    include: '.*/supabase/functions/health/handler\\.ts$',
  },
  {
    name: 'platform-auth',
    dir: join(root, 'supabase/functions/platform-auth'),
    include: '.*/supabase/functions/platform-auth/handler\\.ts$',
  },
  {
    name: 'account-delete',
    dir: join(root, 'supabase/functions/account-delete'),
    include: '.*/supabase/functions/account-delete/handler\\.ts$',
  },
];

function fail(msg) {
  console.error(`EDGE-COVERAGE FAIL: ${msg}`);
  process.exit(1);
}

function findDeno() {
  const which = spawnSync('deno', ['--version'], { encoding: 'utf8' });
  if (which.status === 0) return 'deno';
  return null;
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

const deno = findDeno();
if (!deno) {
  fail('deno not found on PATH — install Deno (CI: denoland/setup-deno)');
}

const covRoot = mkdtempSync(join(tmpdir(), 'botore-edge-cov-'));

try {
  for (const target of TARGETS) {
    console.log(`==> deno test --coverage ${target.name}`);
    const covDir = join(covRoot, target.name);
    const test = spawnSync(
      deno,
      [
        'test',
        '-A',
        '--quiet',
        `--config=${join(target.dir, 'deno.json')}`,
        `--coverage=${covDir}`,
        '.',
      ],
      {
        cwd: target.dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          SUPABASE_JWT_SECRET: '',
          JWT_SECRET: '',
        },
      },
    );
    if (test.stdout) process.stdout.write(test.stdout);
    if (test.stderr) process.stderr.write(test.stderr);
    if (test.status !== 0) fail(`deno test failed for ${target.name} (status ${test.status})`);

    console.log(`==> deno coverage --threshold=${THRESHOLD} ${target.name} handler`);
    const cov = spawnSync(
      deno,
      ['coverage', covDir, `--include=${target.include}`, `--threshold=${THRESHOLD}`],
      { cwd: root, encoding: 'utf8' },
    );
    if (cov.stdout) process.stdout.write(cov.stdout);
    if (cov.stderr) process.stderr.write(cov.stderr);
    if (cov.status !== 0) {
      fail(
        `${target.name} handler coverage below ${THRESHOLD}% (see Deno report above; real measured coverage)`,
      );
    }
  }
} finally {
  rmSync(covRoot, { recursive: true, force: true });
}

console.log(
  JSON.stringify(
    {
      gate: 'edge-coverage',
      thresholdPercent: THRESHOLD,
      targets: TARGETS.map((t) => t.name),
      metric: 'deno coverage --threshold (line + branch + function)',
    },
    null,
    2,
  ),
);
console.log('EDGE-COVERAGE-OK combat-v1 + health handlers');
