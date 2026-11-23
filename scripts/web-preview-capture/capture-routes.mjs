#!/usr/bin/env node
/**
 * Playwright 390×844 screenshots of Expo web export (cheap design preview).
 * Honesty: web preview is NOT native acceptance evidence.
 *
 * Env:
 *   WEB_PREVIEW_BASE_URL  (default http://127.0.0.1:4173)
 *   WEB_PREVIEW_ROUTES    comma-separated FirstRunRoute ids (default Stable)
 *   WEB_PREVIEW_OUT_DIR   (default artifacts/web-preview-captures)
 *   WEB_PREVIEW_SETTLE_MS (default 4000)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const WIDTH = 390;
const HEIGHT = 844;

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

async function main() {
  const base = (process.env.WEB_PREVIEW_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
  const outDir = process.env.WEB_PREVIEW_OUT_DIR || 'artifacts/web-preview-captures';
  const settleMs = Number(process.env.WEB_PREVIEW_SETTLE_MS || '4000');
  const routes = routesFromEnv();
  const sha = (process.env.GITHUB_SHA || 'local').slice(0, 12);

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
    await page.waitForTimeout(Number.isFinite(settleMs) ? settleMs : 4000);
    const file = path.join(outDir, `web-${WIDTH}x${HEIGHT}-${route}-${sha}.png`);
    await page.screenshot({ path: file, fullPage: false });
    written.push(file);
    console.log(`wrote ${file}`);
  }

  const manifest = [
    `commit=${process.env.GITHUB_SHA || 'local'}`,
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
