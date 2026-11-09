/**
 * Pure PNG RGBA decode + pixel diff helpers (C7c unit-tested).
 * Shared by assert-distinct-stills.mjs.
 */
import { inflateSync } from 'node:zlib';

export function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePngRgba(buf) {
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

export function pixelDiffPct(a, b) {
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

/**
 * SpringBoard "Open in…?" sits over blue wallpaper. Require a large share of a
 * center-band grid to be blue-leaning so a single Petrol swatch pixel cannot
 * false-positive (C7b PRR P3).
 */
export function looksLikeSpringBoardOpenDialog(decoded, opts = {}) {
  const { w, h, rows } = decoded;
  const minBlueShare = opts.minBlueShare ?? 0.55;
  const sample = (x, y) => {
    const row = rows[Math.min(h - 1, Math.max(0, y))];
    const i = Math.min(w - 1, Math.max(0, x)) * 4;
    return [row[i], row[i + 1], row[i + 2]];
  };
  const isBlueLean = (r, g, b) => b > 160 && b > r + 20 && r < 180;
  const isCreamGarage = (r, g, b) => r > 200 && g > 180 && b > 150 && r >= g && g >= b;

  let blue = 0;
  let cream = 0;
  let total = 0;
  // 5×5 grid over the upper-mid band where the Open-in sheet floats.
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      const x = Math.floor((w * (gx + 1)) / 6);
      const y = Math.floor(h * (0.22 + gy * 0.06));
      const [r, g, b] = sample(x, y);
      total++;
      if (isBlueLean(r, g, b)) blue++;
      if (isCreamGarage(r, g, b)) cream++;
    }
  }
  const blueShare = blue / total;
  const creamShare = cream / total;
  return blueShare >= minBlueShare && creamShare < 0.2;
}

/** Dominant near-graphite #302D27 in a frame (native splash / AuthEntry chrome). */
export function graphiteShare(decoded, opts = {}) {
  const { w, h, rows } = decoded;
  const target = opts.target ?? [0x30, 0x2d, 0x27];
  const tol = opts.tol ?? 28;
  let hit = 0;
  let total = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  for (let y = 0; y < h; y += step) {
    const row = rows[y];
    for (let x = 0; x < w; x += step) {
      const i = x * 4;
      total++;
      if (
        Math.abs(row[i] - target[0]) <= tol &&
        Math.abs(row[i + 1] - target[1]) <= tol &&
        Math.abs(row[i + 2] - target[2]) <= tol
      ) {
        hit++;
      }
    }
  }
  return total === 0 ? 0 : hit / total;
}
