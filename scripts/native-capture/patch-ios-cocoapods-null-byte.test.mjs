import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { patchIosCocoapodsNullByte } from './patch-ios-cocoapods-null-byte.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('workaround ruby source exists and defines prepend hook', () => {
  const rb = readFileSync(join(__dirname, 'cocoapods_pathname_workaround.rb'), 'utf8');
  assert.match(rb, /module CocoaPodsPathnameWorkaround/);
  assert.match(rb, /relative_base = base_path\.nil\? \? group\.real_path : base_path\.cleanpath/);
  assert.match(rb, /Pod::Project\.prepend/);
});

test('patchIosCocoapodsNullByte injects require and is idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'botore-pod-patch-'));
  const ios = join(root, 'ios');
  mkdirSync(ios, { recursive: true });
  writeFileSync(
    join(ios, 'Podfile'),
    [
      'require File.join(File.dirname(`node --print "require.resolve(\'expo/package.json\')"`), "scripts/autolinking")',
      'prepare_react_native_project!',
      "target 'Botore' do",
      '  use_expo_modules!',
      'end',
      '',
    ].join('\n'),
  );

  try {
    const first = patchIosCocoapodsNullByte(ios);
    assert.equal(first.alreadyPatched, false);
    assert.equal(existsSync(join(ios, 'cocoapods_pathname_workaround.rb')), true);
    const podfile = readFileSync(join(ios, 'Podfile'), 'utf8');
    assert.match(
      podfile,
      /prepare_react_native_project!\n\nrequire_relative '\.\/cocoapods_pathname_workaround'/,
    );

    const second = patchIosCocoapodsNullByte(ios);
    assert.equal(second.alreadyPatched, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pod-install-ci.sh is valid bash and references the patcher', () => {
  const sh = join(__dirname, 'pod-install-ci.sh');
  assert.equal(existsSync(sh), true);
  const body = readFileSync(sh, 'utf8');
  assert.match(body, /patch-ios-cocoapods-null-byte\.mjs/);
  assert.match(body, /pathname contains null byte/);
  const probe = spawnSync('bash', ['-n', sh], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
});
