#!/usr/bin/env node
/**
 * Parse BotorePerf JSON lines from an adb/logcat (or iOS log) dump and emit a
 * structured pass record for R1 / F12 acceptance.
 *
 * Usage:
 *   node scripts/release-perf/parse-botore-perf.mjs --input path/to/logcat.txt \
 *     [--load-kind warm|cold] [--require-envelope live_sealed|dev_fixture] \
 *     [--pass-id sound-on-warm] [--out path/to/pass.json]
 *
 * Reads stdin when --input is omitted.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PHONE_PERF_THRESHOLDS, verdictSummary } from './thresholds.mjs';

export const BOTORE_PERF_LOG_TAG = 'BotorePerf';

/** Match `BotorePerf {...}` even when logcat prefixes the tag. */
const LINE_RE = /BotorePerf\s+(\{.*\})\s*$/;

export function extractBotorePerfPayloads(text) {
  const payloads = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.includes(BOTORE_PERF_LOG_TAG)) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;
    try {
      payloads.push({ line, summary: JSON.parse(m[1]) });
    } catch {
      // Ignore truncated / non-JSON noise.
    }
  }
  return payloads;
}

export function buildPassRecord(summary, opts = {}) {
  const loadKind = opts.loadKind ?? null;
  const verdict = verdictSummary(summary, { loadKind });
  const envelope = summary.envelope ?? null;
  if (opts.requireEnvelope && envelope !== opts.requireEnvelope) {
    return {
      ok: false,
      error: `envelope_${envelope ?? 'missing'}_ne_${opts.requireEnvelope}`,
      summary,
      verdict,
    };
  }
  return {
    ok: true,
    passId: opts.passId ?? null,
    capturedAt: opts.capturedAt ?? new Date().toISOString(),
    thresholds: PHONE_PERF_THRESHOLDS,
    summary: {
      ...summary,
      loadKind: verdict.loadKind,
      passesProposedThresholds: verdict.passesProposedThresholds,
      failures: verdict.failures,
    },
    verdict,
  };
}

function parseArgs(argv) {
  const out = {
    input: null,
    outPath: null,
    loadKind: null,
    requireEnvelope: null,
    passId: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--input') out.input = argv[++i] ?? null;
    else if (a === '--out') out.outPath = argv[++i] ?? null;
    else if (a === '--load-kind') out.loadKind = argv[++i] ?? null;
    else if (a === '--require-envelope') out.requireEnvelope = argv[++i] ?? null;
    else if (a === '--pass-id') out.passId = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

export function main(argv = process.argv.slice(2), io = {}) {
  const readStdin = io.readStdin ?? (() => readFileSync(0, 'utf8'));
  const writeOut = io.writeOut ?? ((p, s) => writeFileSync(p, s, 'utf8'));
  const log = io.log ?? ((s) => process.stdout.write(s));
  const err = io.err ?? ((s) => console.error(s));

  const args = parseArgs(argv);
  if (args.help) {
    log(`Usage: node scripts/release-perf/parse-botore-perf.mjs [options]
  --input <file>                 logcat / log dump (default: stdin)
  --out <file>                   write JSON pass record
  --load-kind warm|cold          operator-declared load mode for verdict
  --require-envelope live_sealed|dev_fixture
  --pass-id <id>                 e.g. sound-on-warm
`);
    return 0;
  }

  if (args.loadKind && args.loadKind !== 'warm' && args.loadKind !== 'cold') {
    err('error: --load-kind must be warm or cold');
    return 2;
  }
  if (
    args.requireEnvelope &&
    args.requireEnvelope !== 'live_sealed' &&
    args.requireEnvelope !== 'dev_fixture'
  ) {
    err('error: --require-envelope must be live_sealed or dev_fixture');
    return 2;
  }

  const text = args.input ? readFileSync(args.input, 'utf8') : readStdin();
  const payloads = extractBotorePerfPayloads(text);
  if (payloads.length === 0) {
    err('error: no BotorePerf JSON lines found');
    return 1;
  }

  const last = payloads[payloads.length - 1];
  const record = buildPassRecord(last.summary, {
    loadKind: args.loadKind,
    requireEnvelope: args.requireEnvelope,
    passId: args.passId,
  });

  const json = `${JSON.stringify(record, null, 2)}\n`;
  if (args.outPath) writeOut(args.outPath, json);
  log(json);
  if (!record.ok) return 1;
  if (record.verdict.passesProposedThresholds === false) return 1;
  return 0;
}

const isDirectRun =
  process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  process.exitCode = main();
}
