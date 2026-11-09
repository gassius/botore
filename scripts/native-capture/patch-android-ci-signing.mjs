#!/usr/bin/env node
/**
 * After `expo prebuild`, patch the ephemeral android/ tree for CI design-review
 * captures (never for store distribution):
 * 1. Force `release` to sign with the debug keystore (installable without secrets).
 * 2. Pin Kotlin to 1.9.25 so expo-modules-core Compose compiler matches
 *    (CI otherwise resolved 1.9.24 and failed compileReleaseKotlin).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');
const androidRoot = join(repoRoot, 'apps/game/android');
const buildGradle = join(androidRoot, 'app/build.gradle');
const rootBuildGradle = join(androidRoot, 'build.gradle');
const gradleProps = join(androidRoot, 'gradle.properties');

const SIGN_MARKER = '// botore-ci-design-capture-debug-signing';
const KOTLIN_PIN = '1.9.25';

if (!existsSync(buildGradle)) {
  console.error(`error: missing ${buildGradle} — run expo prebuild first`);
  process.exit(1);
}

let appGradle = readFileSync(buildGradle, 'utf8');
if (!appGradle.includes(SIGN_MARKER)) {
  if (!/release\s*\{/.test(appGradle)) {
    console.error('error: could not find release { buildType in app/build.gradle');
    process.exit(1);
  }
  appGradle = appGradle.replace(/release\s*\{([\s\S]*?)(\n\s*\})/, (_m, body, close) => {
    const cleaned = String(body).replace(/^\s*signingConfig\s+[^\n]+\n/gm, '');
    return `release {\n            ${SIGN_MARKER}\n            signingConfig signingConfigs.debug${cleaned}${close}`;
  });
  if (!appGradle.includes(SIGN_MARKER)) {
    console.error('error: failed to inject debug signing into release buildType');
    process.exit(1);
  }
  writeFileSync(buildGradle, appGradle);
  console.log(`patched ${buildGradle} (release → signingConfigs.debug)`);
} else {
  console.log('ci signing patch already applied');
}

if (existsSync(gradleProps)) {
  let props = readFileSync(gradleProps, 'utf8');
  const line = `android.kotlinVersion=${KOTLIN_PIN}`;
  if (/^android\.kotlinVersion=/m.test(props)) {
    props = props.replace(/^android\.kotlinVersion=.*$/m, line);
  } else {
    props += `\n# botore CI design-capture Kotlin pin (Compose 1.5.15)\n${line}\n`;
  }
  writeFileSync(gradleProps, props);
  console.log(`patched ${gradleProps} (${line})`);
}

if (existsSync(rootBuildGradle)) {
  let root = readFileSync(rootBuildGradle, 'utf8');
  // Ensure the Kotlin Gradle plugin classpath uses ext.kotlinVersion, not an
  // unversioned resolution that can float to 1.9.24 under RN's BOM.
  const desired = 'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")';
  if (!root.includes(desired)) {
    root = root.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin[^'"]*['"]\)/,
      desired,
    );
    writeFileSync(rootBuildGradle, root);
    console.log(`patched ${rootBuildGradle} (kotlin-gradle-plugin → $kotlinVersion)`);
  }
  // Keep ext default at 1.9.25 even if findProperty returns something older.
  if (/kotlinVersion\s*=\s*findProperty\(['"]android\.kotlinVersion['"]\)\s*\?:/.test(root)) {
    root = root.replace(
      /kotlinVersion\s*=\s*findProperty\(['"]android\.kotlinVersion['"]\)\s*\?:\s*['"][^'"]+['"]/,
      `kotlinVersion = findProperty('android.kotlinVersion') ?: '${KOTLIN_PIN}'`,
    );
    writeFileSync(rootBuildGradle, root);
  }
}
