#!/usr/bin/env node
/**
 * Map changed files → first-run routes for cheap web preview screenshots.
 * Not native acceptance — Expo web / Chromium phone-frame only.
 *
 * Usage:
 *   node scripts/web-preview-capture/map-changed-routes.mjs [file...]
 *   git diff --name-only origin/main...HEAD | node scripts/web-preview-capture/map-changed-routes.mjs
 *
 * Prints comma-separated FirstRunRoute ids (Stable default when UI touched
 * but no finer mapping matches).
 *
 * When capture tooling / route map / design-capture helpers change, captures
 * every first-run route (design review #110).
 */
import path from 'node:path';
import { createInterface } from 'node:readline';

/** Full first-run set — keep in sync with apps/game/src/first-run/routes.ts. */
export const ALL_FIRST_RUN_ROUTES = [
  'Stable',
  'CreateBot',
  'Customise',
  'Opponents',
  'ConfirmFight',
  'Replay',
  'FightResult',
  'Ranking',
  'Settings',
];

/** Capture tooling / map / design-capture → prove every route on web. */
const CAPTURE_TOOLING_RE =
  /(^|\/)scripts\/web-preview-capture\/|(^|\/)\.github\/workflows\/web-preview-screenshots\.yml$|(^|\/)apps\/game\/src\/design-capture\//;

/** @type {ReadonlyArray<{ re: RegExp, routes: readonly string[] }>} */
const RULES = [
  { re: /apps\/game\/src\/result-overlay\//, routes: ['Replay', 'FightResult'] },
  { re: /apps\/game\/src\/result-art\//, routes: ['FightResult'] },
  { re: /apps\/game\/src\/fight-view\//, routes: ['Replay'] },
  { re: /apps\/game\/src\/fight\//, routes: ['Opponents', 'ConfirmFight', 'Replay'] },
  { re: /apps\/game\/src\/ranking\//, routes: ['Ranking'] },
  { re: /apps\/game\/src\/settings\//, routes: ['Settings'] },
  { re: /apps\/game\/src\/session-failure\//, routes: ['Opponents', 'Ranking'] },
  { re: /apps\/game\/src\/garage\/screens\/.*[Cc]reate/, routes: ['CreateBot'] },
  {
    re: /apps\/game\/src\/garage\/.*[Cc]ustomise|apps\/game\/src\/.*customise/,
    routes: ['Customise'],
  },
  {
    re: /apps\/game\/src\/garage-tag\/.*[Oo]pponent|apps\/game\/src\/.*[Oo]pponents/,
    routes: ['Opponents'],
  },
  {
    re: /apps\/game\/src\/garage-tag\/.*[Cc]onfirm|apps\/game\/src\/.*[Cc]onfirm/,
    routes: ['ConfirmFight'],
  },
  {
    re: /apps\/game\/src\/garage-tag\/|apps\/game\/src\/garage\/|apps\/game\/src\/first-run\//,
    routes: ['Stable'],
  },
  {
    re: /apps\/game\/src\/assembler\/|apps\/game\/src\/bot\/|apps\/game\/src\/portrait\//,
    routes: ['Stable', 'Customise'],
  },
  { re: /apps\/game\/src\/arena\/|apps\/game\/src\/audio\//, routes: ['Stable', 'Replay'] },
  { re: /apps\/game\/assets\//, routes: ['Stable', 'Customise', 'Opponents', 'ConfirmFight'] },
  { re: /apps\/game\/src\//, routes: ['Stable'] },
  { re: /apps\/game\/App\.tsx|apps\/game\/index\.js|apps\/game\/app\.json/, routes: ['Stable'] },
];

const DEFAULT_UI_ROUTES = ['Stable', 'Customise', 'Opponents', 'ConfirmFight'];

/**
 * @param {readonly string[]} files
 * @returns {string[]}
 */
export function mapChangedFilesToRoutes(files) {
  const trimmed = files.map((f) => f.trim()).filter(Boolean);
  if (trimmed.some((f) => CAPTURE_TOOLING_RE.test(f))) {
    return [...ALL_FIRST_RUN_ROUTES];
  }

  const routes = new Set();
  let touchedGameUi = false;
  for (const f of trimmed) {
    if (
      f.startsWith('apps/game/src/') ||
      f.startsWith('apps/game/assets/') ||
      f === 'apps/game/App.tsx' ||
      f === 'apps/game/index.js' ||
      f === 'apps/game/app.json'
    ) {
      touchedGameUi = true;
    }
    for (const rule of RULES) {
      if (rule.re.test(f)) {
        for (const r of rule.routes) routes.add(r);
        break;
      }
    }
  }
  if (touchedGameUi && routes.size === 0) {
    for (const r of DEFAULT_UI_ROUTES) routes.add(r);
  }
  if (routes.size === 0) {
    // Docs / CI-only PRs still get one cheap Stable still when the job runs.
    routes.add('Stable');
  }
  return [...routes];
}

async function readFilesFromArgvOrStdin() {
  const argvFiles = process.argv.slice(2).filter((a) => a && !a.startsWith('-'));
  if (argvFiles.length > 0) return argvFiles;
  if (process.stdin.isTTY) return [];
  const lines = [];
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) lines.push(line);
  return lines;
}

async function main() {
  const files = await readFilesFromArgvOrStdin();
  const routes = mapChangedFilesToRoutes(files);
  process.stdout.write(`${routes.join(',')}\n`);
}

const entry = process.argv[1] ? path.basename(process.argv[1]) : '';
const isMain = entry === 'map-changed-routes.mjs';

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
