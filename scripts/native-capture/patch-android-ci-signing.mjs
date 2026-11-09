#!/usr/bin/env node
/**
 * After `expo prebuild`, force the Android `release` buildType to sign with the
 * debug keystore so CI can install a JS-bundle-embedded APK without a release
 * keystore (C7 design-review captures only — never for store distribution).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');
const buildGradle = join(repoRoot, 'apps/game/android/app/build.gradle');

if (!existsSync(buildGradle)) {
  console.error(`error: missing ${buildGradle} — run expo prebuild first`);
  process.exit(1);
}

const MARKER = '// botore-ci-design-capture-debug-signing';
let src = readFileSync(buildGradle, 'utf8');
if (src.includes(MARKER)) {
  console.log('ci signing patch already applied');
  process.exit(0);
}

if (!/release\s*\{/.test(src)) {
  console.error('error: could not find release { buildType in app/build.gradle');
  process.exit(1);
}

// Strip any existing signingConfig line inside the first release { ... } block,
// then inject debug signing immediately after `release {`.
src = src.replace(/release\s*\{([\s\S]*?)(\n\s*\})/, (_m, body, close) => {
  const cleaned = String(body).replace(/^\s*signingConfig\s+[^\n]+\n/gm, '');
  return `release {\n            ${MARKER}\n            signingConfig signingConfigs.debug${cleaned}${close}`;
});

if (!src.includes(MARKER)) {
  console.error('error: failed to inject debug signing into release buildType');
  process.exit(1);
}

writeFileSync(buildGradle, src);
console.log(`patched ${buildGradle} (release → signingConfigs.debug)`);
