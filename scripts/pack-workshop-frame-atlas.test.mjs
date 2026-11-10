#!/usr/bin/env node
/**
 * Headless checks for the C13 workshop-frame → atlas packing recipe.
 * Run: node --test scripts/pack-workshop-frame-atlas.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
} from './workshop-frame-atlas-recipe.mjs';

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
});

test('rejects kit-v001 prefixes', () => {
  assert.throws(
    () => atlasPathForWorkshopKitFile('kits/workshop-frame/v001/parts/torso-oxide.png'),
    {
      message: /v001/,
    },
  );
});

test('pack pairs cover body+weapon oxide/petrol/materials/mask', () => {
  const pairs = workshopFrameKitPackPairs();
  assert.ok(pairs.length >= 18 * 5);
  assert.ok(pairs.some((p) => p.atlasRelative === 'parts/torso/oxide.png'));
  assert.ok(pairs.some((p) => p.atlasRelative === 'parts/weapon-sword/mask.png'));
  assert.ok(!pairs.some((p) => p.atlasRelative.includes('weapon_sword')));
  assert.ok(!pairs.some((p) => p.atlasRelative.includes('/v001/')));
});

test('pack script materializes hyphenated atlas tree from kit-v002', () => {
  const kitDir = join(ROOT, 'apps/game/assets/workshop-frame-kit-v002');
  assert.ok(existsSync(join(kitDir, 'parts/torso-oxide.png')), 'kit asset present');
  const out = mkdtempSync(join(tmpdir(), 'botore-atlas-v2-'));
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
    assert.ok(existsSync(join(out, 'fx/hit.png')));
    assert.ok(existsSync(join(out, 'base/audio/hit.m4a')));
    assert.ok(!existsSync(join(out, 'parts/weapon_sword')));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
