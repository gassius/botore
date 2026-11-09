#!/usr/bin/env node
/**
 * After `expo prebuild`, patch the ephemeral android/ tree for CI design-review
 * captures (never for store distribution):
 * 1. Force `release` to sign with the debug keystore (installable without secrets).
 * 2. Pin Kotlin to 1.9.25 so expo-modules-core Compose compiler matches
 *    (CI otherwise resolved 1.9.24 and failed compileReleaseKotlin).
 * 3. Allow cleartext HTTP to the emulator loopback (10.0.2.2) so live-fight
 *    captures can reach local Supabase — release builds block cleartext by default.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');
const androidRoot = join(repoRoot, 'apps/game/android');
const buildGradle = join(androidRoot, 'app/build.gradle');
const rootBuildGradle = join(androidRoot, 'build.gradle');
const gradleProps = join(androidRoot, 'gradle.properties');
const manifestPath = join(androidRoot, 'app/src/main/AndroidManifest.xml');
const xmlDir = join(androidRoot, 'app/src/main/res/xml');
const networkSecurityConfig = join(xmlDir, 'network_security_config.xml');

const SIGN_MARKER = '// botore-ci-design-capture-debug-signing';
const CLEARTEXT_MARKER = 'botore-ci-cleartext-loopback';
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

// Live-fight captures talk to host Supabase via http://10.0.2.2:54321.
if (existsSync(manifestPath)) {
  mkdirSync(xmlDir, { recursive: true });
  writeFileSync(
    networkSecurityConfig,
    `<?xml version="1.0" encoding="utf-8"?>
<!-- ${CLEARTEXT_MARKER}: CI / local emulator only -->
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
    </domain-config>
</network-security-config>
`,
  );
  let manifest = readFileSync(manifestPath, 'utf8');
  if (!manifest.includes('android:networkSecurityConfig')) {
    if (!/<application\b[^>]*>/.test(manifest)) {
      console.error('error: could not find <application> in AndroidManifest.xml');
      process.exit(1);
    }
    manifest = manifest.replace(/<application\b([^>]*)>/, (_m, attrs) => {
      let cleaned = String(attrs).replace(/\s+android:usesCleartextTraffic="[^"]*"/g, '');
      cleaned = cleaned.replace(/\s+android:debuggable="[^"]*"/g, '');
      // Debuggable so cold-start can plant Documents markers via run-as (CI only).
      return `<application${cleaned} android:networkSecurityConfig="@xml/network_security_config" android:usesCleartextTraffic="true" android:debuggable="true">`;
    });
    writeFileSync(manifestPath, manifest);
    console.log(`patched ${manifestPath} (cleartext → 10.0.2.2 / localhost; debuggable)`);
  } else {
    console.log('ci cleartext networkSecurityConfig already present');
  }
}
