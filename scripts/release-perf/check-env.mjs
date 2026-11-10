#!/usr/bin/env node
/**
 * Tooling check for R1 native release-perf measurement.
 *
 * Usage:
 *   node scripts/release-perf/check-env.mjs [--platform android|ios|both] [--tools-only]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--platform') platform = argv[++i] ?? platform;
    if (argv[i] === '--tools-only') toolsOnly = true;
  }
  return { platform, toolsOnly };
}

function easHasReleasePerfProfile() {
  const path = join(repoRoot, 'apps/game/eas.json');
  if (!existsSync(path)) return false;
  try {
    const eas = JSON.parse(readFileSync(path, 'utf8'));
    return Boolean(eas?.build?.['release-perf']);
  } catch {
    return false;
  }
}

const { platform, toolsOnly } = parseArgs(process.argv.slice(2));
const needAndroid = platform === 'android' || platform === 'both';
const needIos = platform === 'ios' || platform === 'both';

const report = {
  tip: 'r1-native-release-perf',
  platform,
  toolsOnly,
  repoRoot,
  scripts: {
    parse: existsSync(join(__dirname, 'parse-botore-perf.mjs')),
    thresholds: existsSync(join(__dirname, 'thresholds.mjs')),
    runAndroid: existsSync(join(__dirname, 'run-android-measure.sh')),
    resultsTemplate: existsSync(join(__dirname, 'results-template.json')),
  },
  easReleasePerfProfile: easHasReleasePerfProfile(),
  doc: existsSync(join(repoRoot, 'docs/architecture/android-release-perf.md')),
  adb: hasCmd('adb'),
  xcrun: hasCmd('xcrun'),
  easCli: hasCmd('eas') || hasCmd('eas-cli'),
};

let ok =
  report.scripts.parse &&
  report.scripts.thresholds &&
  report.scripts.runAndroid &&
  report.scripts.resultsTemplate &&
  report.easReleasePerfProfile &&
  report.doc;

if (!toolsOnly) {
  if (needAndroid && !report.adb) ok = false;
  if (needIos && !report.xcrun) ok = false;
}

console.log(JSON.stringify(report, null, 2));
if (!ok) {
  console.error(
    [
      '',
      'Release-perf tooling incomplete for requested platform.',
      !report.scripts.parse ? '- Missing scripts/release-perf/parse-botore-perf.mjs' : null,
      !report.scripts.runAndroid ? '- Missing scripts/release-perf/run-android-measure.sh' : null,
      !report.easReleasePerfProfile ? '- Missing apps/game/eas.json build.release-perf' : null,
      !report.doc ? '- Missing docs/architecture/android-release-perf.md' : null,
      !toolsOnly && needAndroid && !report.adb
        ? '- Install Android platform-tools (adb) and attach a physical phone or emulator.'
        : null,
      !toolsOnly && needIos && !report.xcrun
        ? '- iOS measure requires macOS + Xcode (xcrun / device or Simulator).'
        : null,
      '- See docs/architecture/android-release-perf.md and scripts/release-perf/README.md',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  process.exit(1);
}
