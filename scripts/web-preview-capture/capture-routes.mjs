#!/usr/bin/env node
/**
 * Playwright 390×844 screenshots of Expo web export (cheap design preview).
 * Honesty: web preview is NOT native acceptance evidence.
 *
 * Fail closed: waits for the route root testID; exits non-zero if
 * SessionAuthErrorScreen or PlayableMisconfiguredScreen is shown; rejects
 * near-uniform / inset-occluded stills.
 *
 * Phone-ish frame (design polish after #110 / #111):
 * - deviceScaleFactor 3 (~native px/pt)
 * - Worst-case insets: iPhone top 47 + Android nav bottom 48 → ~749 pt usable
 *
 * Env:
 *   WEB_PREVIEW_BASE_URL  (default http://127.0.0.1:4173)
 *   WEB_PREVIEW_ROUTES    comma-separated FirstRunRoute ids (default Stable)
 *   WEB_PREVIEW_OUT_DIR   (default artifacts/web-preview-captures)
 *   WEB_PREVIEW_SETTLE_MS (default 4000)
 *   WEB_PREVIEW_HEAD_SHA  PR head SHA (falls back to GITHUB_SHA / local)
 */
import { inflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const WIDTH = 390;
const HEIGHT = 844;
/** ~native Pixel density (design: native ≈ 2.77 px/pt). */
const DEVICE_SCALE_FACTOR = 3;
/**
 * Worst case of each edge on a 390×844@3x frame (M1):
 * iPhone-ish status/safe top 47 + Android nav bottom 48 → usable ≈ 749 pt.
 */
const INSET_TOP_PT = 47;
const INSET_BOTTOM_PT = 48;
const INSET_HEX = '#000000';

/** First-run route → root testID (RN web maps testID → data-testid). */
const ROUTE_ROOT_TEST_IDS = {
  Stable: 'slot-stable',
  CreateBot: 'slot-create-bot',
  Customise: 'slot-customise',
  Opponents: 'slot-opponents',
  ConfirmFight: 'slot-confirm',
  Replay: 'slot-replay',
  FightResult: 'slot-result',
  Ranking: 'slot-ranking',
  Settings: 'slot-settings',
};

const FAIL_CLOSED_TEST_IDS = ['session-auth-error', 'playable-misconfigured'];

function routesFromEnv() {
  const raw = process.env.WEB_PREVIEW_ROUTES || 'Stable';
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function headSha() {
  const raw = process.env.WEB_PREVIEW_HEAD_SHA || process.env.GITHUB_SHA || 'local';
  return raw;
}

/**
 * Reserve phone chrome: pad the app root only and paint opaque inset bars.
 * Must NOT select the inset bars themselves via `body > *` (B1).
 */
async function applyPhoneInsets(page) {
  await page.evaluate(
    ({ top, bottom }) => {
      const STYLE_ID = 'botore-web-preview-phone-insets';
      document.getElementById(STYLE_ID)?.remove();
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          height: 100% !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          background: #000 !important;
        }
        /* App root only — never the fixed inset bars (data-botore-phone-inset). */
        body > *:not([data-botore-phone-inset]),
        body > #root {
          box-sizing: border-box !important;
          padding-top: ${top}px !important;
          padding-bottom: ${bottom}px !important;
          min-height: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
        }
        #botore-web-preview-inset-top,
        #botore-web-preview-inset-bottom {
          position: fixed !important;
          left: 0 !important;
          right: 0 !important;
          z-index: 2147483647 !important;
          pointer-events: none !important;
          background: #000 !important;
          padding: 0 !important;
          margin: 0 !important;
          min-height: 0 !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
        }
        #botore-web-preview-inset-top {
          top: 0 !important;
          height: ${top}px !important;
          max-height: ${top}px !important;
        }
        #botore-web-preview-inset-bottom {
          bottom: 0 !important;
          height: ${bottom}px !important;
          max-height: ${bottom}px !important;
        }
      `;
      document.head.appendChild(style);
      for (const [id, where] of [
        ['botore-web-preview-inset-top', 'top'],
        ['botore-web-preview-inset-bottom', 'bottom'],
      ]) {
        if (!document.getElementById(id)) {
          const bar = document.createElement('div');
          bar.id = id;
          bar.setAttribute('data-botore-phone-inset', where);
          document.body.appendChild(bar);
        }
      }
    },
    { top: INSET_TOP_PT, bottom: INSET_BOTTOM_PT },
  );
}

/**
 * Fail closed when the route root is in the DOM but covered by inset chrome
 * (isVisible ignores occlusion).
 */
async function assertRouteHitAtCenter(page, route) {
  const rootId = ROUTE_ROOT_TEST_IDS[route];
  const x = Math.floor(WIDTH / 2);
  const y = Math.floor(INSET_TOP_PT + (HEIGHT - INSET_TOP_PT - INSET_BOTTOM_PT) / 2);
  const hit = await page.evaluate(
    ({ x, y, rootId }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return { ok: false, reason: 'elementFromPoint returned null' };
      const root = document.querySelector(`[data-testid="${rootId}"]`);
      if (!root) return { ok: false, reason: `missing [data-testid=${rootId}]` };
      if (
        el.hasAttribute('data-botore-phone-inset') ||
        el.id?.startsWith('botore-web-preview-inset')
      ) {
        return {
          ok: false,
          reason: `hit inset chrome (${el.id || el.getAttribute('data-botore-phone-inset')})`,
        };
      }
      const inside = root === el || root.contains(el);
      return {
        ok: inside,
        reason: inside
          ? 'ok'
          : `elementFromPoint hit ${el.tagName}#${el.id || ''}[data-testid=${el.getAttribute('data-testid')}] outside ${rootId}`,
      };
    },
    { x, y, rootId },
  );
  if (!hit.ok) {
    throw new Error(
      `Web preview fail-closed: center (${x},${y}) not inside ${rootId} for ${route}: ${hit.reason}`,
    );
  }
}

async function assertRouteVisible(page, route) {
  const rootId = ROUTE_ROOT_TEST_IDS[route];
  if (!rootId) {
    throw new Error(`No root testID mapping for route ${route}`);
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    for (const badId of FAIL_CLOSED_TEST_IDS) {
      const bad = page.getByTestId(badId);
      if (await bad.isVisible().catch(() => false)) {
        throw new Error(
          `Web preview fail-closed: saw testID=${badId} while capturing ${route} (expected ${rootId})`,
        );
      }
    }
    const root = page.getByTestId(rootId);
    if (await root.isVisible().catch(() => false)) {
      await assertRouteHitAtCenter(page, route);
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `Web preview fail-closed: timed out waiting for testID=${rootId} on route ${route}`,
  );
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode PNG IHDR + IDAT (8-bit RGB/RGBA) and measure colour diversity.
 * Rejects near-uniform stills (B1b) including solid inset black.
 */
export function analyzePngPaint(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) {
    throw new Error('not a PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatParts = [];
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buf.length) break;
    const data = buf.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height) throw new Error('PNG missing IHDR');
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const inflated = inflateSync(Buffer.concat(idatParts));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const expected = (stride + 1) * height;
  if (inflated.length < expected) {
    throw new Error(`PNG IDAT too short: ${inflated.length} < ${expected}`);
  }

  const rgba = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = inflated[rowStart];
    const raw = inflated.subarray(rowStart + 1, rowStart + 1 + stride);
    const out = rgba.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? out[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      const x = raw[i];
      let val;
      switch (filter) {
        case 0:
          val = x;
          break;
        case 1:
          val = (x + left) & 0xff;
          break;
        case 2:
          val = (x + up) & 0xff;
          break;
        case 3:
          val = (x + ((left + up) >> 1)) & 0xff;
          break;
        case 4:
          val = (x + paethPredictor(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`unsupported PNG filter ${filter}`);
      }
      out[i] = val;
    }
    prev = Buffer.from(out);
  }

  /** @type {Map<number, number>} */
  const counts = new Map();
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + x * bpp;
      const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
      counts.set(key, (counts.get(key) || 0) + 1);
      total += 1;
    }
  }
  let dominantKey = 0;
  let dominantCount = 0;
  for (const [key, count] of counts) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantKey = key;
    }
  }
  const dominantHex = `#${dominantKey.toString(16).padStart(6, '0')}`;
  return {
    width,
    height,
    unique: counts.size,
    total,
    dominantShare: total > 0 ? dominantCount / total : 1,
    dominantHex,
  };
}

export function assertPaintNotBlank(stats, route) {
  if (stats.unique < 50) {
    throw new Error(
      `Web preview fail-closed: ${route} still near-uniform (unique colours=${stats.unique} < 50)`,
    );
  }
  if (stats.dominantShare > 0.98) {
    throw new Error(
      `Web preview fail-closed: ${route} still near-uniform (${(stats.dominantShare * 100).toFixed(1)}% ${stats.dominantHex})`,
    );
  }
  if (stats.dominantHex === INSET_HEX && stats.dominantShare > 0.9) {
    throw new Error(
      `Web preview fail-closed: ${route} still dominated by inset colour ${INSET_HEX} (${(stats.dominantShare * 100).toFixed(1)}%)`,
    );
  }
}

async function assertScreenshotHasPaint(filePath, route) {
  const buf = await readFile(filePath);
  const stats = analyzePngPaint(buf);
  assertPaintNotBlank(stats, route);
  console.log(
    `paint-ok ${route}: unique=${stats.unique} dominant=${stats.dominantHex} ${(stats.dominantShare * 100).toFixed(1)}%`,
  );
}

async function main() {
  const base = (process.env.WEB_PREVIEW_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
  const outDir = process.env.WEB_PREVIEW_OUT_DIR || 'artifacts/web-preview-captures';
  const settleMs = Number(process.env.WEB_PREVIEW_SETTLE_MS || '4000');
  const routes = routesFromEnv();
  const fullSha = headSha();
  const sha = fullSha.slice(0, 12);

  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  const page = await context.newPage();
  const written = [];

  for (const route of routes) {
    const url = `${base}/?route=${encodeURIComponent(route)}`;
    console.log(`capturing ${route} ← ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
    await applyPhoneInsets(page);
    await assertRouteVisible(page, route);
    if (Number.isFinite(settleMs) && settleMs > 0) {
      await page.waitForTimeout(settleMs);
      // Re-apply after settle (SPA remounts can wipe injected chrome).
      await applyPhoneInsets(page);
      // Re-check after settle — auth can still race into the error screen.
      await assertRouteVisible(page, route);
    }
    const file = path.join(outDir, `web-${WIDTH}x${HEIGHT}-${route}-${sha}.png`);
    await page.screenshot({ path: file, fullPage: false });
    await assertScreenshotHasPaint(file, route);
    written.push(file);
    console.log(`wrote ${file}`);
  }

  const usable = HEIGHT - INSET_TOP_PT - INSET_BOTTOM_PT;
  const manifest = [
    `commit=${fullSha}`,
    `platform=web-preview`,
    `viewport=${WIDTH}x${HEIGHT}`,
    `deviceScaleFactor=${DEVICE_SCALE_FACTOR}`,
    `insets=top${INSET_TOP_PT},bottom${INSET_BOTTOM_PT}`,
    `insetsNote=worst-case iPhone top 47 + Android nav bottom 48`,
    `usable≈${usable}pt`,
    `honesty=NOT native acceptance — Expo web / Chromium only`,
    `routes=${routes.join(',')}`,
    ...written.map((f) => `file=${f}`),
    '',
  ].join('\n');
  await writeFile(path.join(outDir, `manifest-web-${sha}.txt`), manifest, 'utf8');

  await browser.close();
}

const entry = process.argv[1] ? path.basename(process.argv[1]) : '';
const isMain = entry === 'capture-routes.mjs';

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
