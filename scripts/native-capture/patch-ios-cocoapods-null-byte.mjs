#!/usr/bin/env node
/**
 * After `expo prebuild`, inject CocoaPods pnpm null-byte workaround into ios/.
 *
 * CocoaPods 1.15–1.17 can raise `ArgumentError - pathname contains null byte`
 * during Pods project generation on pnpm monorepos (GHA macos). See
 * https://github.com/CocoaPods/CocoaPods/issues/12798.
 *
 * Copies cocoapods_pathname_workaround.rb next to Podfile and requires it.
 * Idempotent. Optional `--ios-root <path>` for tests.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workaroundSrc = join(__dirname, 'cocoapods_pathname_workaround.rb');
const marker = "require_relative './cocoapods_pathname_workaround'";

function resolveIosRoot(argv) {
  const flag = argv.indexOf('--ios-root');
  if (flag >= 0 && argv[flag + 1]) return resolve(argv[flag + 1]);
  return join(__dirname, '../../apps/game/ios');
}

export function patchIosCocoapodsNullByte(iosRoot) {
  const podfilePath = join(iosRoot, 'Podfile');
  const workaroundDst = join(iosRoot, 'cocoapods_pathname_workaround.rb');

  if (!existsSync(iosRoot) || !existsSync(podfilePath)) {
    throw new Error(`missing ${podfilePath} — run expo prebuild first`);
  }
  if (!existsSync(workaroundSrc)) {
    throw new Error(`missing workaround source ${workaroundSrc}`);
  }

  copyFileSync(workaroundSrc, workaroundDst);

  let podfile = readFileSync(podfilePath, 'utf8');
  if (podfile.includes(marker)) {
    return { alreadyPatched: true, podfilePath, workaroundDst };
  }

  const needle = 'prepare_react_native_project!\n';
  if (podfile.includes(needle)) {
    podfile = podfile.replace(needle, `${needle}\n${marker}\n`);
  } else {
    const requireLines = [...podfile.matchAll(/^require .+$/gm)];
    if (requireLines.length > 0) {
      const last = requireLines[requireLines.length - 1];
      const idx = last.index + last[0].length;
      podfile = `${podfile.slice(0, idx)}\n${marker}${podfile.slice(idx)}`;
    } else {
      podfile = `${marker}\n${podfile}`;
    }
  }

  writeFileSync(podfilePath, podfile);
  return { alreadyPatched: false, podfilePath, workaroundDst };
}

const isDirect =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirect) {
  try {
    const result = patchIosCocoapodsNullByte(resolveIosRoot(process.argv.slice(2)));
    if (result.alreadyPatched) {
      console.log('patch-ios-cocoapods-null-byte: Podfile already requires workaround');
    } else {
      console.log('patch-ios-cocoapods-null-byte: injected CocoaPods pathname workaround');
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
