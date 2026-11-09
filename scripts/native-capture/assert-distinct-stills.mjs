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
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';

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

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngRgba(buf) {
  if (buf.compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 0, 8, 0, 8) !== 0) {
    throw new Error('not a PNG');
  }
  let pos = 8;
  let w = 0;
  let h = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      const bit = data[8];
      const color = data[9];
      if (bit !== 8 || color !== 6) throw new Error(`unsupported PNG bit=${bit} color=${color}`);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  const rows = [];
  let prev = Buffer.alloc(stride);
  let i = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[i++];
    const row = Buffer.from(raw.subarray(i, i + stride));
    i += stride;
    if (filter === 1) {
      for (let x = bpp; x < stride; x++) row[x] = (row[x] + row[x - bpp]) & 255;
    } else if (filter === 2) {
      for (let x = 0; x < stride; x++) row[x] = (row[x] + prev[x]) & 255;
    } else if (filter === 3) {
      for (let x = 0; x < stride; x++) {
        const left = x >= bpp ? row[x - bpp] : 0;
        row[x] = (row[x] + ((left + prev[x]) >> 1)) & 255;
      }
    } else if (filter === 4) {
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0;
        const b = prev[x];
        const c = x >= bpp ? prev[x - bpp] : 0;
        row[x] = (row[x] + paeth(a, b, c)) & 255;
      }
    } else if (filter !== 0) {
      throw new Error(`bad PNG filter ${filter}`);
    }
    rows.push(row);
    prev = row;
  }
  return { w, h, rows };
}

function pixelDiffPct(a, b) {
  if (a.w !== b.w || a.h !== b.h) return 100;
  let diff = 0;
  const total = a.w * a.h;
  for (let y = 0; y < a.h; y++) {
    const ra = a.rows[y];
    const rb = b.rows[y];
    for (let x = 0; x < a.w; x++) {
      const i = x * 4;
      if (ra[i] !== rb[i] || ra[i + 1] !== rb[i + 1] || ra[i + 2] !== rb[i + 2]) diff++;
    }
  }
  return (100 * diff) / total;
}

/** Garage Tag cream #F4E4C8 — SpringBoard "Open in…?" stills are blue wallpaper. */
function looksLikeSpringBoardOpenDialog(decoded) {
  const { w, h, rows } = decoded;
  const sample = (x, y) => {
    const row = rows[Math.min(h - 1, Math.max(0, y))];
    const i = Math.min(w - 1, Math.max(0, x)) * 4;
    return [row[i], row[i + 1], row[i + 2]];
  };
  // Center band of an "Open in" sheet sits over blue wallpaper; garage is cream.
  const [r, g, b] = sample(Math.floor(w / 2), Math.floor(h * 0.35));
  const tealWallpaper = b > 140 && g > 140 && r < 160 && b >= r;
  const creamGarage = r > 200 && g > 180 && b > 150 && r >= g && g >= b;
  return tealWallpaper && !creamGarage;
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
