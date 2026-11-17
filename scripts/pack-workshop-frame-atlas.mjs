#!/usr/bin/env node
/**
 * A1 / C13: Materialize supabase/seed/atlas/vN from Workshop Frame kit + v1
 * carry-forward (base / arena / FX / proof catalogue). Does not publish —
 * pair with `ATLAS_VERSION=vN node scripts/seed-atlas-storage.mjs`.
 *
 * Default: kit-v003 → atlas/v3.
 * Historical: ATLAS_VERSION=v2 rebuilds kit-v002 → atlas/v2 (separate fallback).
 *
 * Usage:
 *   node scripts/pack-workshop-frame-atlas.mjs
 *   ATLAS_VERSION=v2 node scripts/pack-workshop-frame-atlas.mjs
 *   KIT_DIR=/path/to/kit node scripts/pack-workshop-frame-atlas.mjs
 *
 * Hosted publish (Carlos credentials — never commit secrets):
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… DATABASE_URL=… \
 *     node scripts/pack-workshop-frame-atlas.mjs && \
 *     ATLAS_VERSION=v3 node scripts/seed-atlas-storage.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  V1_CARRY_FORWARD_PATHS,
  WORKSHOP_FRAME_ATLAS_VERSION,
  WORKSHOP_FRAME_KIT_VERSION,
  WORKSHOP_FRAME_LEGACY_ATLAS_VERSION,
  WORKSHOP_FRAME_LEGACY_KIT_VERSION,
  WORKSHOP_FRAME_PACK_TARGETS,
  workshopFrameKitPackPairs,
} from './workshop-frame-atlas-recipe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = process.env.ATLAS_VERSION ?? WORKSHOP_FRAME_ATLAS_VERSION;
const OUT_DIR = process.env.ATLAS_SEED_DIR ?? join(ROOT, 'supabase/seed/atlas', VERSION);
const V1_DIR = join(ROOT, 'supabase/seed/atlas/v1');

const KIT_DIRS = {
  v003: join(ROOT, 'apps/game/assets/workshop-frame-kit-v003'),
  v002: join(ROOT, 'apps/game/assets/workshop-frame-kit-v002'),
};

const STORE_KIT_DIRS = {
  v003: '/cursor/stores/bc-5a7e5278-ae46-41fa-b832-db846a325e85/inbox/kit-v003-extract/kit-v003',
  v002: '/cursor/stores/bc-5a7e5278-ae46-41fa-b832-db846a325e85/docs/art-direction/2026-11-09-first-run/workshop-frame-kit-v002/kit-v002',
};

function fail(msg) {
  console.error(`ATLAS-PACK-FAIL ${msg}`);
  process.exit(1);
}

function resolvePackTarget(version) {
  const target = WORKSHOP_FRAME_PACK_TARGETS[version];
  if (!target) {
    throw new Error(
      `refusing ATLAS_VERSION=${version}; pack-workshop-frame-atlas only writes ${Object.keys(WORKSHOP_FRAME_PACK_TARGETS).join('|')}`,
    );
  }
  return target;
}

/**
 * Hard guard before any delete: this packer only materializes workshop-frame
 * v2 (history) or v3 (active). A leftover `ATLAS_VERSION=v1` from seed scripts
 * used to rmSync the committed supabase/seed/atlas/v1 tree.
 */
export function assertWorkshopFramePackTarget(version, outDir, v1Dir = V1_DIR) {
  resolvePackTarget(version);
  if (resolve(outDir) === resolve(v1Dir)) {
    throw new Error(`refusing to wipe committed v1 seed at ${v1Dir}`);
  }
}

function resolveKitDir(kitVersion) {
  if (process.env.KIT_DIR) {
    if (!existsSync(process.env.KIT_DIR)) fail(`KIT_DIR missing: ${process.env.KIT_DIR}`);
    return process.env.KIT_DIR;
  }
  const defaultDir = KIT_DIRS[kitVersion];
  if (defaultDir && existsSync(join(defaultDir, 'parts'))) return defaultDir;
  const storeDir = STORE_KIT_DIRS[kitVersion];
  if (storeDir && existsSync(join(storeDir, 'parts'))) return storeDir;
  fail(`kit-${kitVersion} not found under ${defaultDir}; set KIT_DIR=…`);
}

function ensureParent(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function copyFile(src, dest) {
  if (!existsSync(src)) fail(`missing source ${src}`);
  ensureParent(dest);
  cpSync(src, dest);
}

function buildManifestJson(pairs, kitVersion, atlasVersion) {
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
        kit: `workshop-frame-${kitVersion}`,
      };
    }
    if (!parts[pair.partId].images.includes(pair.atlasRelative)) {
      parts[pair.partId].images.push(pair.atlasRelative);
    }
  }

  return {
    version: atlasVersion,
    status: 'draft',
    note: `Workshop Frame kit-${kitVersion} media keys packed onto F5 parts/<hyphenatedPartId>/… plus v1 carry-forward. budgets_final stays false. Do not mix kit versions.`,
    kit: {
      id: 'workshop-frame',
      version: kitVersion,
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
  let target;
  try {
    assertWorkshopFramePackTarget(VERSION, OUT_DIR, V1_DIR);
    target = resolvePackTarget(VERSION);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  if (!existsSync(V1_DIR)) fail(`v1 seed dir missing: ${V1_DIR}`);

  const kitVersion = target.kitVersion;
  const kitDir = resolveKitDir(kitVersion);
  const pairs = workshopFrameKitPackPairs({
    includeWraps: target.includeWraps,
    kitVersion,
  });

  // Preserve committed README.md across wipe of generated pack bytes.
  const readmePath = join(OUT_DIR, 'README.md');
  const readmeBackup = existsSync(readmePath) ? readFileSync(readmePath) : null;
  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUT_DIR, { recursive: true });
  if (readmeBackup) {
    writeFileSync(readmePath, readmeBackup);
  }

  // Carry-forward v1 proof bytes (skip its manifest — we write a versioned one).
  for (const rel of V1_CARRY_FORWARD_PATHS) {
    if (rel === 'manifest.json') continue;
    copyFile(join(V1_DIR, rel), join(OUT_DIR, rel));
  }

  for (const pair of pairs) {
    copyFile(join(kitDir, pair.kitRelative), join(OUT_DIR, pair.atlasRelative));
  }

  const manifest = buildManifestJson(pairs, kitVersion, VERSION);
  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // Sanity: hyphenated weapon path exists; underscore form must not be a folder name.
  const swordOxide = join(OUT_DIR, 'parts/weapon-sword/oxide.png');
  if (!existsSync(swordOxide)) fail(`expected packed ${swordOxide}`);
  if (existsSync(join(OUT_DIR, 'parts/weapon_sword'))) {
    fail('underscore weapon folder leaked into atlas pack');
  }
  if (target.includeWraps) {
    const wrap = join(OUT_DIR, 'parts/hand-r-wrap/oxide.png');
    if (!existsSync(wrap)) fail(`expected packed wrap ${wrap}`);
  }

  const kitManifest = join(kitDir, 'manifest.json');
  if (existsSync(kitManifest)) {
    const raw = JSON.parse(readFileSync(kitManifest, 'utf8'));
    if (raw.version !== kitVersion) {
      fail(`kit version ${raw.version} != ${kitVersion}`);
    }
  }

  console.log(`ATLAS-PACK-OK ${VERSION} kit=${kitDir} pairs=${pairs.length} out=${OUT_DIR}`);
}

const isDirectRun =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isDirectRun) {
  main();
}

export {
  WORKSHOP_FRAME_ATLAS_VERSION,
  WORKSHOP_FRAME_KIT_VERSION,
  WORKSHOP_FRAME_LEGACY_ATLAS_VERSION,
  WORKSHOP_FRAME_LEGACY_KIT_VERSION,
};
