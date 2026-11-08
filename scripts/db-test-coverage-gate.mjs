#!/usr/bin/env node
/**
 * B1 database test coverage gate (real suite execution — not invented %).
 *
 * Discovers every `TEST-OK …` marker declared in `supabase/tests/run.sql`,
 * then requires 100% of those markers to appear in a psql run log. That is
 * measured execution coverage of the SQL acceptance suite (F1–F4 + health).
 *
 * Usage:
 *   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/run.sql 2>&1 | tee /tmp/db-tests.log
 *   node scripts/db-test-coverage-gate.mjs --log /tmp/db-tests.log
 *
 * Without --log: lists discovered markers and exits 0 (inventory / docs).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const suitePath = join(root, 'supabase/tests/run.sql');

function fail(msg) {
  console.error(`DB-COVERAGE FAIL: ${msg}`);
  process.exit(1);
}

function discoverMarkers(sql) {
  const markers = [];
  const re = /raise\s+notice\s+'TEST-OK\s+([^']+)'/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    markers.push(`TEST-OK ${m[1]}`);
  }
  return [...new Set(markers)];
}

const args = process.argv.slice(2);
let logPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--log') {
    logPath = args[i + 1];
    i++;
  }
}

const sql = readFileSync(suitePath, 'utf8');
const expected = discoverMarkers(sql);
if (expected.length < 1) fail(`no TEST-OK markers found in ${suitePath}`);

console.log(`==> discovered ${expected.length} TEST-OK markers in supabase/tests/run.sql`);

if (!logPath) {
  for (const marker of expected) console.log(`  - ${marker}`);
  console.log(
    JSON.stringify(
      {
        gate: 'db-test-coverage',
        mode: 'inventory',
        markersTotal: expected.length,
        note: 'Pass --log <psql-output> in CI to enforce 100% execution',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const log = readFileSync(logPath, 'utf8');
const missing = expected.filter((marker) => !log.includes(marker));
const covered = expected.length - missing.length;
const pct = ((covered / expected.length) * 100).toFixed(1);

console.log(
  JSON.stringify(
    {
      gate: 'db-test-coverage',
      markersCovered: covered,
      markersTotal: expected.length,
      coveragePercent: Number(pct),
      metric: 'TEST-OK marker execution from supabase/tests/run.sql',
      missing,
    },
    null,
    2,
  ),
);

if (missing.length > 0) {
  fail(
    `${missing.length}/${expected.length} TEST-OK markers missing from ${logPath} (${pct}% execution coverage)`,
  );
}

console.log(`DB-COVERAGE-OK ${covered}/${expected.length} TEST-OK markers (100%)`);
