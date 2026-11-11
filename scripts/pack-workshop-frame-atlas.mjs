#!/usr/bin/env node
/**
 * C13: Materialize supabase/seed/atlas/v2 from Workshop Frame kit-v002 + v1
 * carry-forward (base / arena / FX / proof catalogue). Does not publish —
 * pair with `ATLAS_VERSION=v2 node scripts/seed-atlas-storage.mjs`.
 *
 * Usage:
 *   node scripts/pack-workshop-frame-atlas.mjs
 *   KIT_DIR=/path/to/workshop-frame-kit-v002 node scripts/pack-workshop-frame-atlas.mjs
 *
 * Hosted publish (Carlos credentials — never commit secrets):
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… DATABASE_URL=… \
 *     node scripts/pack-workshop-frame-atlas.mjs && \
 *     ATLAS_VERSION=v2 node scripts/seed-atlas-storage.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  V1_CARRY_FORWARD_PATHS,
  WORKSHOP_FRAME_ATLAS_VERSION,
  WORKSHOP_FRAME_KIT_VERSION,
  workshopFrameKitPackPairs,
} from './workshop-frame-atlas-recipe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = process.env.ATLAS_VERSION ?? WORKSHOP_FRAME_ATLAS_VERSION;
const OUT_DIR = process.env.ATLAS_SEED_DIR ?? join(ROOT, 'supabase/seed/atlas', VERSION);
const V1_DIR = join(ROOT, 'supabase/seed/atlas/v1');
const DEFAULT_KIT_DIR = join(ROOT, 'apps/game/assets/workshop-frame-kit-v002');
const STORE_KIT_DIR =
  '/cursor/stores/bc-5a7e5278-ae46-41fa-b832-db846a325e85/docs/art-direction/2026-11-09-first-run/workshop-frame-kit-v002/kit-v002';

function fail(msg) {
  console.error(`ATLAS-PACK-FAIL ${msg}`);
  process.exit(1);
}

/**
 * Hard guard before any delete: this packer only materializes workshop-frame v2.
 * A leftover `ATLAS_VERSION=v1` from seed scripts used to rmSync the committed
 * supabase/seed/atlas/v1 tree.
 */
export function assertWorkshopFramePackTarget(version, outDir, v1Dir = V1_DIR) {
  if (version !== WORKSHOP_FRAME_ATLAS_VERSION) {
    throw new Error(
      `refusing ATLAS_VERSION=${version}; pack-workshop-frame-atlas only writes ${WORKSHOP_FRAME_ATLAS_VERSION}`,
    );
  }
  if (resolve(outDir) === resolve(v1Dir)) {
    throw new Error(`refusing to wipe committed v1 seed at ${v1Dir}`);
  }
}

function resolveKitDir() {
  if (process.env.KIT_DIR) {
    if (!existsSync(process.env.KIT_DIR)) fail(`KIT_DIR missing: ${process.env.KIT_DIR}`);
    return process.env.KIT_DIR;
  }
  if (existsSync(join(DEFAULT_KIT_DIR, 'parts'))) return DEFAULT_KIT_DIR;
  if (existsSync(join(STORE_KIT_DIR, 'parts'))) return STORE_KIT_DIR;
  fail(`kit-v002 not found under ${DEFAULT_KIT_DIR} or Project store path; set KIT_DIR=…`);
}

function ensureParent(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function copyFile(src, dest) {
  if (!existsSync(src)) fail(`missing source ${src}`);
  ensureParent(dest);
  cpSync(src, dest);
}

function buildManifestJson(pairs) {
  /** @type {Record<string, { images: string[], audio: string[], soundTags: string[], kit?: string }>} */
  const parts = {
    'chassis-basic': {
      images: ['parts/chassis-basic/body.png', 'parts/chassis-basic/mask.png'],
      audio: ['parts/chassis-basic/hit.m4a'],
      soundTags: ['chassis.light'],
    },
    'paint-crimson': {
      images: ['parts/paint-crimson/swatch.png'],
      audio: [],
      soundTags: [],
    },
    'paint-cobalt': {
      images: ['parts/paint-cobalt/swatch.png'],
      audio: [],
      soundTags: [],
    },
    'weapon-sword': {
      images: ['parts/weapon-sword/sprite.png'],
      audio: ['parts/weapon-sword/swing.m4a'],
      soundTags: ['weapon.sword'],
    },
    'weapon-axe': {
      images: ['parts/weapon-axe/sprite.png'],
      audio: ['parts/weapon-axe/swing.m4a'],
      soundTags: ['weapon.axe'],
    },
    'weapon-dagger': {
      images: ['parts/weapon-dagger/sprite.png'],
      audio: ['parts/weapon-dagger/swing.m4a'],
      soundTags: ['weapon.dagger'],
    },
  };

  for (const pair of pairs) {
    if (!parts[pair.partId]) {
      parts[pair.partId] = {
        images: [],
        audio: [],
        soundTags: [],
        kit: `workshop-frame-${WORKSHOP_FRAME_KIT_VERSION}`,
      };
    }
    if (!parts[pair.partId].images.includes(pair.atlasRelative)) {
      parts[pair.partId].images.push(pair.atlasRelative);
    }
  }

  return {
    version: VERSION,
    status: 'draft',
    note: 'Workshop Frame kit-v002 media keys packed onto F5 parts/<hyphenatedPartId>/… plus v1 carry-forward. budgets_final stays false. Do not mix kit-v001.',
    kit: {
      id: 'workshop-frame',
      version: WORKSHOP_FRAME_KIT_VERSION,
      weaponIdRule:
        'Kit filenames use underscores (weapon_sword-*.png); atlas/catalogue partIds use hyphens (weapon-sword). Adapter maps both.',
    },
    basePack: {
      uiTap: 'base/audio/ui-tap.m4a',
      musicLoop: 'base/audio/music-loop.m4a',
      hit: 'base/audio/hit.m4a',
      dodge: 'base/audio/dodge.m4a',
      defeat: 'base/audio/defeat.m4a',
      hush: 'base/audio/hush.m4a',
      win: 'base/audio/win.m4a',
      swing: 'base/audio/swing.m4a',
    },
    arena: {
      quiet: {
        image: 'arenas/quiet/bg.png',
        ambient: 'arenas/quiet/ambient.m4a',
      },
    },
    fx: {
      hit: 'fx/hit.png',
      dodge: 'fx/dodge.png',
      defeat: 'fx/defeat.png',
    },
    parts,
  };
}

function main() {
  try {
    assertWorkshopFramePackTarget(VERSION, OUT_DIR, V1_DIR);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  if (!existsSync(V1_DIR)) fail(`v1 seed dir missing: ${V1_DIR}`);

  const kitDir = resolveKitDir();
  const pairs = workshopFrameKitPackPairs();

  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUT_DIR, { recursive: true });

  // Carry-forward v1 proof bytes (skip its manifest — we write a v2 one).
  for (const rel of V1_CARRY_FORWARD_PATHS) {
    if (rel === 'manifest.json') continue;
    copyFile(join(V1_DIR, rel), join(OUT_DIR, rel));
  }

  for (const pair of pairs) {
    copyFile(join(kitDir, pair.kitRelative), join(OUT_DIR, pair.atlasRelative));
  }

  const manifest = buildManifestJson(pairs);
  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // Sanity: hyphenated weapon path exists; underscore form must not be a folder name.
  const swordOxide = join(OUT_DIR, 'parts/weapon-sword/oxide.png');
  if (!existsSync(swordOxide)) fail(`expected packed ${swordOxide}`);
  if (existsSync(join(OUT_DIR, 'parts/weapon_sword'))) {
    fail('underscore weapon folder leaked into atlas pack');
  }

  const kitManifest = join(kitDir, 'manifest.json');
  if (existsSync(kitManifest)) {
    const raw = JSON.parse(readFileSync(kitManifest, 'utf8'));
    if (raw.version !== WORKSHOP_FRAME_KIT_VERSION) {
      fail(`kit version ${raw.version} != ${WORKSHOP_FRAME_KIT_VERSION}`);
    }
  }

  console.log(`ATLAS-PACK-OK ${VERSION} kit=${kitDir} pairs=${pairs.length} out=${OUT_DIR}`);
}

const isDirectRun =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isDirectRun) {
  main();
}
