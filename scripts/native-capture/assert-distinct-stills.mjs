#!/usr/bin/env node
/**
 * Assert design-capture stills are meaningfully distinct (not just SHA-different
 * status-bar clock ticks). Decodes PNG RGBA and requires pairwise pixel
 * difference above a threshold.
 *
 * Usage:
 *   node scripts/native-capture/assert-distinct-stills.mjs \
 *     --platform ios --out artifacts/native-captures --routes Stable,Customise,Replay
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePngRgba, looksLikeSpringBoardOpenDialog, pixelDiffPct } from './png-diff.mjs';

function parseArgs(argv) {
  let platform = 'ios';
  let outDir = 'artifacts/native-captures';
  let routesCsv = 'Stable,Customise,Replay';
  let minPct = 0.5;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--platform') platform = argv[++i] ?? platform;
    else if (argv[i] === '--out') outDir = argv[++i] ?? outDir;
    else if (argv[i] === '--routes') routesCsv = argv[++i] ?? routesCsv;
    else if (argv[i] === '--min-pct') minPct = Number(argv[++i] ?? minPct);
  }
  const routes = routesCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { platform, outDir, routes, minPct };
}

function findRoutePng(outDir, platform, route) {
  const files = readdirSync(outDir)
    .filter((f) => f.startsWith(`${platform}-`) && f.endsWith(`-${route}.png`))
    .sort();
  if (files.length === 0) return null;
  return join(outDir, files[files.length - 1]);
}

const { platform, outDir, routes, minPct } = parseArgs(process.argv.slice(2));
const files = [];
for (const route of routes) {
  const file = findRoutePng(outDir, platform, route);
  if (!file) {
    console.error(`error: missing ${platform}-*-${route}.png under ${outDir}`);
    process.exit(1);
  }
  const buf = readFileSync(file);
  const sha = createHash('sha256').update(buf).digest('hex');
  const decoded = decodePngRgba(buf);
  files.push({ route, file, sha, decoded });
  console.error(`ok: ${file} sha256=${sha.slice(0, 12)}… ${decoded.w}x${decoded.h}`);
  if (platform === 'ios' && looksLikeSpringBoardOpenDialog(decoded)) {
    console.error(
      `error: ${file} looks like SpringBoard "Open in …?" (custom-scheme openurl dialog) — use simctl launch + intent file`,
    );
    process.exit(1);
  }
}

let failed = false;
for (let i = 0; i < files.length; i++) {
  for (let j = i + 1; j < files.length; j++) {
    const a = files[i];
    const b = files[j];
    if (a.sha === b.sha) {
      console.error(`error: identical stills for ${a.route} and ${b.route} (${a.file})`);
      failed = true;
      continue;
    }
    const pct = pixelDiffPct(a.decoded, b.decoded);
    console.error(`diff: ${a.route} vs ${b.route} = ${pct.toFixed(3)}% pixels`);
    if (pct < minPct) {
      console.error(
        `error: ${a.route} vs ${b.route} differ by only ${pct.toFixed(3)}% (need ≥ ${minPct}%) — likely same route / status-bar tick`,
      );
      failed = true;
    }
  }
}

if (failed) {
  console.error('deep link / capture intent likely did not change the visible route');
  process.exit(1);
}
console.error('assert-distinct-stills: all route pairs meaningfully distinct');
