#!/usr/bin/env node
/**
 * Playwright 390×844 screenshots of Expo web export (cheap design preview).
 * Honesty: web preview is NOT native acceptance evidence.
 *
 * Fail closed: waits for the route root testID; exits non-zero if
 * SessionAuthErrorScreen or PlayableMisconfiguredScreen is shown.
 *
 * Phone-ish frame (design polish after #110):
 * - deviceScaleFactor 3 (~native px/pt)
 * - 24 pt top + 48 pt bottom insets so fit/clipping can be judged
 *
 * Env:
 *   WEB_PREVIEW_BASE_URL  (default http://127.0.0.1:4173)
 *   WEB_PREVIEW_ROUTES    comma-separated FirstRunRoute ids (default Stable)
 *   WEB_PREVIEW_OUT_DIR   (default artifacts/web-preview-captures)
 *   WEB_PREVIEW_SETTLE_MS (default 4000)
 *   WEB_PREVIEW_HEAD_SHA  PR head SHA (falls back to GITHUB_SHA / local)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const WIDTH = 390;
const HEIGHT = 844;
/** ~native Pixel density (design: native ≈ 2.77 px/pt). */
const DEVICE_SCALE_FACTOR = 3;
/** Simulated status bar / Android nav bar (pt). */
const INSET_TOP_PT = 24;
const INSET_BOTTOM_PT = 48;

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
 * Reserve phone chrome: pad the document and paint opaque inset bars so
 * design review can judge "fits above nav" / clipping against ~780 pt usable.
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
        /* Keep app content in the usable band between insets. */
        body > * {
          box-sizing: border-box !important;
          padding-top: ${top}px !important;
          padding-bottom: ${bottom}px !important;
          min-height: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
        }
        #botore-web-preview-inset-top,
        #botore-web-preview-inset-bottom {
          position: fixed;
          left: 0;
          right: 0;
          z-index: 2147483647;
          pointer-events: none;
          background: #000;
        }
        #botore-web-preview-inset-top { top: 0; height: ${top}px; }
        #botore-web-preview-inset-bottom { bottom: 0; height: ${bottom}px; }
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
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `Web preview fail-closed: timed out waiting for testID=${rootId} on route ${route}`,
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
    written.push(file);
    console.log(`wrote ${file}`);
  }

  const manifest = [
    `commit=${fullSha}`,
    `platform=web-preview`,
    `viewport=${WIDTH}x${HEIGHT}`,
    `deviceScaleFactor=${DEVICE_SCALE_FACTOR}`,
    `insets=top${INSET_TOP_PT},bottom${INSET_BOTTOM_PT}`,
    `usable≈${HEIGHT - INSET_TOP_PT - INSET_BOTTOM_PT}pt`,
    `honesty=NOT native acceptance — Expo web / Chromium only`,
    `routes=${routes.join(',')}`,
    ...written.map((f) => `file=${f}`),
    '',
  ].join('\n');
  await writeFile(path.join(outDir, `manifest-web-${sha}.txt`), manifest, 'utf8');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
