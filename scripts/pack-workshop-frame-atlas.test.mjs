#!/usr/bin/env node
/**
 * Headless checks for the workshop-frame → atlas/v1 packing recipe (BT-171).
 * Run: node --test scripts/pack-workshop-frame-atlas.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import test from 'node:test';
import {
  atlasPathForWorkshopKitFile,
  canonicalAtlasPartId,
  workshopFrameKitPackPairs,
  WORKSHOP_FRAME_ATLAS_VERSION,
  WORKSHOP_FRAME_LEGACY_ATLAS_VERSION,
} from './workshop-frame-atlas-recipe.mjs';
import { assertWorkshopFramePackTarget } from './pack-workshop-frame-atlas.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('weapon ids: kit underscore → atlas hyphen', () => {
  assert.equal(canonicalAtlasPartId('weapon_sword'), 'weapon-sword');
  assert.equal(canonicalAtlasPartId('weapon-sword'), 'weapon-sword');
  assert.equal(
    atlasPathForWorkshopKitFile('parts/weapon_sword-oxide.png'),
    'parts/weapon-sword/oxide.png',
  );
  assert.equal(
    atlasPathForWorkshopKitFile('materials/weapon_axe-under.png'),
    'parts/weapon-axe/material-under.png',
  );
  assert.equal(
    atlasPathForWorkshopKitFile('masks/upper_arm_l-paint.png'),
    'parts/upper-arm-l/mask.png',
  );
  assert.equal(
    atlasPathForWorkshopKitFile('parts/hand_r_wrap-oxide.png'),
    'parts/hand-r-wrap/oxide.png',
  );
});

test('rejects kit-v001 prefixes', () => {
  assert.throws(
    () => atlasPathForWorkshopKitFile('kits/workshop-frame/v001/parts/torso-oxide.png'),
    {
      message: /v001/,
    },
  );
});

test('pack pairs cover body+wrap+weapon oxide/petrol/materials/mask for v003', () => {
  const pairs = workshopFrameKitPackPairs({ includeWraps: true, kitVersion: 'v003' });
  assert.ok(pairs.length >= 20 * 5);
  assert.ok(pairs.some((p) => p.atlasRelative === 'parts/torso/oxide.png'));
  assert.ok(pairs.some((p) => p.atlasRelative === 'parts/weapon-sword/mask.png'));
  assert.ok(pairs.some((p) => p.atlasRelative === 'parts/hand-l-wrap/oxide.png'));
  assert.ok(pairs.some((p) => p.atlasRelative === 'parts/hand-r-wrap/material-over.png'));
  assert.ok(!pairs.some((p) => p.atlasRelative.includes('weapon_sword')));
  assert.ok(!pairs.some((p) => p.atlasRelative.includes('/v001/')));
});

test('default atlas version is v1', () => {
  assert.equal(WORKSHOP_FRAME_ATLAS_VERSION, 'v1');
});

test('pack target guard allows v1 overlay and refuses retired v2/v3', () => {
  const v1 = join(ROOT, 'supabase/seed/atlas/v1');
  assert.deepEqual(assertWorkshopFramePackTarget('v1', v1, v1), { overlay: true });
  assert.deepEqual(
    assertWorkshopFramePackTarget('v1', join(ROOT, 'supabase/seed/atlas/tmp-v1'), v1),
    { overlay: false },
  );
  assert.throws(() => assertWorkshopFramePackTarget('v2', join(ROOT, 'supabase/seed/atlas/v2'), v1), {
    message: /refusing ATLAS_VERSION=v2|retired/,
  });
  assert.throws(() => assertWorkshopFramePackTarget('v3', join(ROOT, 'supabase/seed/atlas/v3'), v1), {
    message: /refusing ATLAS_VERSION=v3|retired/,
  });
  assert.throws(
    () => assertWorkshopFramePackTarget(WORKSHOP_FRAME_LEGACY_ATLAS_VERSION, v1, v1),
    { message: /refusing|retired/ },
  );
});

test('pack script overlays kit-v003 into committed v1 without wiping proof bytes', () => {
  const v1Manifest = join(ROOT, 'supabase/seed/atlas/v1/manifest.json');
  const v1Tap = join(ROOT, 'supabase/seed/atlas/v1/base/audio/ui-tap.m4a');
  const v1Chassis = join(ROOT, 'supabase/seed/atlas/v1/parts/chassis-basic/body.png');
  assert.ok(existsSync(v1Manifest), 'committed v1 manifest present');
  assert.ok(existsSync(v1Tap), 'committed v1 payload present');
  assert.ok(existsSync(v1Chassis), 'committed proof chassis present');
  const beforeTap = readFileSync(v1Tap);
  const beforeChassis = readFileSync(v1Chassis);
  const kitDir = join(ROOT, 'apps/game/assets/workshop-frame-kit-v003');
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/pack-workshop-frame-atlas.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      ATLAS_VERSION: 'v1',
      KIT_DIR: kitDir,
    },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /ATLAS-PACK-OK v1.*mode=overlay/);
  assert.ok(existsSync(v1Tap), 'v1 audio must survive overlay');
  assert.ok(existsSync(v1Chassis), 'v1 chassis must survive overlay');
  assert.deepEqual(readFileSync(v1Tap), beforeTap);
  assert.deepEqual(readFileSync(v1Chassis), beforeChassis);
  assert.ok(existsSync(join(ROOT, 'supabase/seed/atlas/v1/parts/torso/oxide.png')));
  assert.ok(existsSync(join(ROOT, 'supabase/seed/atlas/v1/parts/hand-r-wrap/oxide.png')));
  assert.ok(existsSync(join(ROOT, 'supabase/seed/atlas/v1/parts/weapon-sword/oxide.png')));
  const manifest = JSON.parse(readFileSync(v1Manifest, 'utf8'));
  assert.equal(manifest.version, 'v1');
  assert.ok(manifest.parts.torso);
  assert.ok(manifest.parts['hand-r-wrap']);
  assert.ok(manifest.parts['chassis-basic']);
});

test('pack script materializes hyphenated atlas tree into alternate seed dir', () => {
  const kitDir = join(ROOT, 'apps/game/assets/workshop-frame-kit-v003');
  assert.ok(existsSync(join(kitDir, 'parts/torso-oxide.png')), 'kit asset present');
  assert.ok(existsSync(join(kitDir, 'parts/hand_r_wrap-oxide.png')), 'wrap asset present');
  const out = mkdtempSync(join(tmpdir(), 'botore-atlas-v1-'));
  try {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/pack-workshop-frame-atlas.mjs')], {
      cwd: ROOT,
      env: {
        ...process.env,
        ATLAS_VERSION: WORKSHOP_FRAME_ATLAS_VERSION,
        ATLAS_SEED_DIR: out,
        KIT_DIR: kitDir,
      },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /ATLAS-PACK-OK/);
    assert.ok(existsSync(join(out, 'parts/torso/oxide.png')));
    assert.ok(existsSync(join(out, 'parts/weapon-sword/oxide.png')));
    assert.ok(existsSync(join(out, 'parts/upper-arm-l/mask.png')));
    assert.ok(existsSync(join(out, 'parts/hand-r-wrap/oxide.png')));
    assert.ok(existsSync(join(out, 'fx/hit.png')));
    assert.ok(existsSync(join(out, 'base/audio/hit.m4a')));
    assert.ok(existsSync(join(out, 'parts/chassis-basic/body.png')));
    assert.ok(!existsSync(join(out, 'parts/weapon_sword')));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('pack script refuses retired ATLAS_VERSION=v3', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/pack-workshop-frame-atlas.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      ATLAS_VERSION: 'v3',
      ATLAS_SEED_DIR: mkdtempSync(join(tmpdir(), 'botore-atlas-refuse-')),
    },
    encoding: 'utf8',
  });
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}\n${r.stdout}`, /ATLAS-PACK-FAIL.*refusing ATLAS_VERSION=v3/);
});
