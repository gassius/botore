#!/usr/bin/env node
/**
 * Playwright 390×844 screenshots of Expo web export (cheap design preview).
 * Honesty: web preview is NOT native acceptance evidence.
 *
 * Fail closed: waits for the route root testID; exits non-zero if
 * SessionAuthErrorScreen or PlayableMisconfiguredScreen is shown.
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
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const written = [];

  for (const route of routes) {
    const url = `${base}/?route=${encodeURIComponent(route)}`;
    console.log(`capturing ${route} ← ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
    await assertRouteVisible(page, route);
    if (Number.isFinite(settleMs) && settleMs > 0) {
      await page.waitForTimeout(settleMs);
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
