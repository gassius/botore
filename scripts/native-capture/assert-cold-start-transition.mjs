#!/usr/bin/env node
/**
 * Assert cold-start frames capture native splash/title graphite #302D27 and a
 * later, different in-app frame (not a single Stable still repeated).
 *
 * Usage:
 *   node scripts/native-capture/assert-cold-start-transition.mjs \
 *     --out artifacts/native-captures --platform ios
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePngRgba, graphiteShare, pixelDiffPct } from './png-diff.mjs';

function parseArgs(argv) {
  let platform = 'ios';
  let outDir = 'artifacts/native-captures';
  // Splash logo often covers most of the framebuffer; AuthEntry chrome is ~15–25%.
  // Require any early/mid frame to show meaningful graphite, not ≥35% full-bleed.
  let minGraphite = 0.12;
  let minDiffPct = 1.0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--platform') platform = argv[++i] ?? platform;
    else if (argv[i] === '--out') outDir = argv[++i] ?? outDir;
    else if (argv[i] === '--min-graphite') minGraphite = Number(argv[++i] ?? minGraphite);
    else if (argv[i] === '--min-diff-pct') minDiffPct = Number(argv[++i] ?? minDiffPct);
  }
  return { platform, outDir, minGraphite, minDiffPct };
}

const { platform, outDir, minGraphite, minDiffPct } = parseArgs(process.argv.slice(2));
const frames = readdirSync(outDir)
  .filter(
    (f) => f.startsWith(`${platform}-`) && f.includes('-ColdStart-frame') && f.endsWith('.png'),
  )
  .sort();

if (frames.length < 2) {
  console.error(`error: need ≥2 ${platform}-*-ColdStart-frame*.png under ${outDir}`);
  process.exit(1);
}

const decoded = frames.map((f) => {
  const path = join(outDir, f);
  const img = decodePngRgba(readFileSync(path));
  const g = graphiteShare(img);
  console.error(`frame ${f}: graphiteShare=${(100 * g).toFixed(1)}% ${img.w}x${img.h}`);
  return { path, img, g };
});

// Splash can land on frame 0–N; AuthEntry title also uses graphite chrome.
// Take the best graphite share across the first half of the sequence.
const earlyWindow = decoded.slice(0, Math.max(2, Math.ceil(decoded.length / 2)));
const late = decoded.slice(-Math.min(4, decoded.length));
const earlyMax = Math.max(...earlyWindow.map((d) => d.g));
const lateMin = Math.min(...late.map((d) => d.g));

if (earlyMax < minGraphite) {
  console.error(
    `error: cold-start frames lack splash/title graphite #302D27 (max share ${(100 * earlyMax).toFixed(1)}% in first half, need ≥${(100 * minGraphite).toFixed(0)}%)`,
  );
  process.exit(1);
}

let bestDiff = 0;
for (const a of earlyWindow) {
  for (const b of late) {
    bestDiff = Math.max(bestDiff, pixelDiffPct(a.img, b.img));
  }
}
console.error(`cold-start early→late max pixel diff=${bestDiff.toFixed(3)}%`);
if (bestDiff < minDiffPct) {
  console.error(
    `error: cold-start frames look identical (diff ${bestDiff.toFixed(3)}% < ${minDiffPct}%) — Stable still repeated, not splash→title`,
  );
  process.exit(1);
}

console.error(
  `assert-cold-start-transition: ok early graphite=${(100 * earlyMax).toFixed(1)}% late graphite=${(100 * lateMin).toFixed(1)}% diff=${bestDiff.toFixed(3)}%`,
);
