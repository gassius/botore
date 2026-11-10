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
  // Prefer a measurable graphite span (splash full-bleed → title silhouette), or
  // fall back to pixel diff alone when shares stay high but pixels move.
  let minGraphiteSpan = 0.02;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--platform') platform = argv[++i] ?? platform;
    else if (argv[i] === '--out') outDir = argv[++i] ?? outDir;
    else if (argv[i] === '--min-graphite') minGraphite = Number(argv[++i] ?? minGraphite);
    else if (argv[i] === '--min-diff-pct') minDiffPct = Number(argv[++i] ?? minDiffPct);
    else if (argv[i] === '--min-graphite-span')
      minGraphiteSpan = Number(argv[++i] ?? minGraphiteSpan);
  }
  return { platform, outDir, minGraphite, minDiffPct, minGraphiteSpan };
}

const { platform, outDir, minGraphite, minDiffPct, minGraphiteSpan } = parseArgs(
  process.argv.slice(2),
);
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

// Non-overlapping early vs late windows when possible so short sequences still
// compare first vs last rather than overlapping the same identical title frames.
let earlyWindow;
let late;
if (decoded.length >= 4) {
  const mid = Math.floor(decoded.length / 2);
  earlyWindow = decoded.slice(0, mid);
  late = decoded.slice(mid);
} else {
  earlyWindow = [decoded[0]];
  late = [decoded[decoded.length - 1]];
}

const earlyMax = Math.max(...earlyWindow.map((d) => d.g));
const lateMin = Math.min(...late.map((d) => d.g));
const allG = decoded.map((d) => d.g);
const graphiteSpan = Math.max(...allG) - Math.min(...allG);

if (earlyMax < minGraphite) {
  console.error(
    `error: cold-start frames lack splash/title graphite #302D27 (max share ${(100 * earlyMax).toFixed(1)}% in early window, need ≥${(100 * minGraphite).toFixed(0)}%)`,
  );
  process.exit(1);
}

let bestDiff = 0;
for (const a of earlyWindow) {
  for (const b of late) {
    bestDiff = Math.max(bestDiff, pixelDiffPct(a.img, b.img));
  }
}
// Also score first→last explicitly (splash → held title silhouette).
bestDiff = Math.max(bestDiff, pixelDiffPct(decoded[0].img, decoded[decoded.length - 1].img));

console.error(
  `cold-start early→late max pixel diff=${bestDiff.toFixed(3)}% graphiteSpan=${(100 * graphiteSpan).toFixed(2)}%`,
);

const diffOk = bestDiff >= minDiffPct;
const spanOk = graphiteSpan >= minGraphiteSpan;
if (!diffOk && !spanOk) {
  console.error(
    `error: cold-start frames look identical (diff ${bestDiff.toFixed(3)}% < ${minDiffPct}% and graphite span ${(100 * graphiteSpan).toFixed(2)}% < ${(100 * minGraphiteSpan).toFixed(0)}%) — missed splash→title (title-only or splash-only strip)`,
  );
  process.exit(1);
}

// Late frames should still show graphite chrome / silhouette (not AuthEntry cream).
if (lateMin < minGraphite * 0.5) {
  console.error(
    `error: late cold-start frames lost graphite silhouette (late min ${(100 * lateMin).toFixed(1)}%) — expected held launch-title, not AuthEntry/Stable`,
  );
  process.exit(1);
}

console.error(
  `assert-cold-start-transition: ok early graphite=${(100 * earlyMax).toFixed(1)}% late graphite=${(100 * lateMin).toFixed(1)}% diff=${bestDiff.toFixed(3)}% span=${(100 * graphiteSpan).toFixed(2)}%`,
);
