#!/usr/bin/env node
/**
 * Lightweight env/tooling check for C7 native design captures.
 * Exits 0 when the requested platform tooling is present; prints guidance otherwise.
 *
 * Usage:
 *   node scripts/native-capture/check-capture-env.mjs [--platform android|ios|both]
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');

function hasCmd(cmd) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  // Some tools (adb) use different flags; treat missing binary as fail.
  if (r.error && r.error.code === 'ENOENT') return false;
  const which = spawnSync('bash', ['-lc', `command -v ${cmd}`], { encoding: 'utf8' });
  return which.status === 0 && which.stdout.trim().length > 0;
}

function parseArgs(argv) {
  let platform = 'android';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--platform') platform = argv[++i] ?? platform;
  }
  return { platform };
}

const { platform } = parseArgs(process.argv.slice(2));
const report = {
  tip: 'native-design-captures',
  platform,
  repoRoot,
  scriptsPresent: existsSync(join(__dirname, 'run-design-capture.sh')),
  easJson: existsSync(join(repoRoot, 'apps/game/eas.json')),
  adb: hasCmd('adb'),
  xcrun: hasCmd('xcrun'),
  java: hasCmd('java'),
};

const needAndroid = platform === 'android' || platform === 'both';
const needIos = platform === 'ios' || platform === 'both';

let ok = report.scriptsPresent && report.easJson;
if (needAndroid && !report.adb) ok = false;
if (needIos && !report.xcrun) ok = false;

console.log(JSON.stringify(report, null, 2));
if (!ok) {
  console.error(
    [
      '',
      'Capture tooling incomplete for requested platform.',
      needAndroid && !report.adb
        ? '- Install Android platform-tools (adb) and start an emulator/device.'
        : null,
      needIos && !report.xcrun
        ? '- iOS captures require macOS + Xcode Simulator (xcrun simctl).'
        : null,
      '- See docs/architecture/native-design-captures.md',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  process.exit(1);
}
