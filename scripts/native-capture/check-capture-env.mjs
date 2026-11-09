#!/usr/bin/env node
/**
 * Lightweight env/tooling check for C7 native design captures.
 * Exits 0 when the requested platform tooling is present; prints guidance otherwise.
 *
 * Usage:
 *   node scripts/native-capture/check-capture-env.mjs [--platform android|ios|both] [--tools-only]
 *
 * --tools-only: only verify committed scripts + eas.json (no adb/xcrun). Use before
 * the emulator boots; full platform checks run once adb is available.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');

function hasCmd(cmd) {
  const which = spawnSync('bash', ['-lc', `command -v ${cmd}`], { encoding: 'utf8' });
  return which.status === 0 && which.stdout.trim().length > 0;
}

function parseArgs(argv) {
  let platform = 'android';
  let toolsOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--platform') platform = argv[++i] ?? platform;
    if (argv[i] === '--tools-only') toolsOnly = true;
  }
  return { platform, toolsOnly };
}

const { platform, toolsOnly } = parseArgs(process.argv.slice(2));
const report = {
  tip: 'native-design-captures',
  platform,
  toolsOnly,
  repoRoot,
  scriptsPresent: existsSync(join(__dirname, 'run-design-capture.sh')),
  ciAndroidScriptPresent: existsSync(join(__dirname, 'ci-android-emulator-capture.sh')),
  ciIosScriptPresent: existsSync(join(__dirname, 'ci-ios-simulator-capture.sh')),
  easJson: existsSync(join(repoRoot, 'apps/game/eas.json')),
  adb: hasCmd('adb'),
  xcrun: hasCmd('xcrun'),
  java: hasCmd('java'),
};

const needAndroid = platform === 'android' || platform === 'both';
const needIos = platform === 'ios' || platform === 'both';

let ok = report.scriptsPresent && report.easJson;
if (needAndroid && !report.ciAndroidScriptPresent) ok = false;
if (needIos && !report.ciIosScriptPresent) ok = false;
if (!toolsOnly) {
  if (needAndroid && !report.adb) ok = false;
  if (needIos && !report.xcrun) ok = false;
}

console.log(JSON.stringify(report, null, 2));
if (!ok) {
  console.error(
    [
      '',
      'Capture tooling incomplete for requested platform.',
      !report.scriptsPresent ? '- Missing scripts/native-capture/run-design-capture.sh' : null,
      needAndroid && !report.ciAndroidScriptPresent
        ? '- Missing scripts/native-capture/ci-android-emulator-capture.sh'
        : null,
      needIos && !report.ciIosScriptPresent
        ? '- Missing scripts/native-capture/ci-ios-simulator-capture.sh'
        : null,
      !report.easJson ? '- Missing apps/game/eas.json' : null,
      !toolsOnly && needAndroid && !report.adb
        ? '- Install Android platform-tools (adb) and start an emulator/device.'
        : null,
      !toolsOnly && needIos && !report.xcrun
        ? '- iOS captures require macOS + Xcode Simulator (xcrun simctl).'
        : null,
      '- See docs/architecture/native-design-captures.md',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  process.exit(1);
}
