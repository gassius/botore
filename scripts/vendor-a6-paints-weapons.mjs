#!/usr/bin/env node
/**
 * E7 / A6: vendor paints v4 + A4 weapons v1 into the Workshop Frame kit tree,
 * bake pattern fill PNGs for hazard/racing main-channel parts, and patch
 * kit manifest (paint_tokens, weapons, assets, poses).
 *
 * Sources (inbox):
 *   Botore-A6-patterns-tott-v1.zip
 *   Botore-A4-weapons-v1.zip
 *   A4-paints.json (sha verified separately)
 *
 * Does not invent stripe art — pattern fills are generated from A6 paints.json
 * parameters clipped to existing kit paint masks.
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = '/cursor/stores/bc-5a7e5278-ae46-41fa-b832-db846a325e85/inbox';
const KIT = join(ROOT, 'apps/game/assets/workshop-frame-kit-v003');
const GAME_ASSETS = join(ROOT, 'apps/game/assets');
const TMP = '/tmp/botore-e7-vendor';

const A6_ZIP = join(STORE, 'Botore-A6-patterns-tott-v1.zip');
const A4_WEAPONS_ZIP = join(STORE, 'Botore-A4-weapons-v1.zip');
const A6_SHA = '605724968cd1bddaa413ac4df1ef079ce8a357c175a05d057f6dd64f4459fa2a';
const PAINTS_SHA = '3cdc0c7a59b34cc34dc7e124bfd98ecc43814528a2d4a5a644239c6ec486c5f2';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fail(msg) {
  console.error(`E7-VENDOR-FAIL ${msg}`);
  process.exit(1);
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function unzip(zip, dest) {
  ensureDir(dest);
  const r = spawnSync('unzip', ['-qo', zip, '-d', dest], { encoding: 'utf8' });
  if (r.status !== 0) fail(`unzip ${zip}: ${r.stderr || r.stdout}`);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const WEAPON_SPECS = {
  mace: {
    id: 'weapon_mace',
    slot: 'mace',
    w: 150,
    h: 230,
    grip: [75, 170],
    sockets: { grip_main: [75, 170] },
    parent: 'hand_r',
    attach_angle: 80,
    z: 85,
    hands: 'one',
    grip_style: 'forward',
    pose_src: 'sword',
    z_overrides: {},
    layering: { hand_r: 80, weapon: 85, hand_r_wrap: 92 },
  },
  hammer: {
    id: 'weapon_hammer',
    slot: 'hammer',
    w: 180,
    h: 338,
    grip: [90, 214],
    sockets: { grip_main: [90, 214], grip_off: [90, 292] },
    parent: 'hand_r',
    attach_angle: 90,
    z: 85,
    hands: 'two',
    grip_style: 'two-handed',
    pose_src: 'axe',
    z_overrides: { hand_l_wrap: 91 },
    layering: { hand_l: 65, hand_r: 80, weapon: 85, hand_l_wrap: 91, hand_r_wrap: 92 },
    off_grip_released_in: ['victory', 'defeat', 'portrait'],
    off_grip_released_reason:
      'Same contract as the axe: victory is one-handed, defeat lets go with the rear hand.',
  },
  spear: {
    id: 'weapon_spear',
    slot: 'spear',
    w: 140,
    h: 420,
    grip: [70, 300],
    sockets: { grip_main: [70, 300], grip_off: [70, 378] },
    parent: 'hand_r',
    attach_angle: 90,
    z: 85,
    hands: 'two',
    grip_style: 'two-handed',
    pose_src: 'axe',
    z_overrides: { hand_l_wrap: 91 },
    layering: { hand_l: 65, hand_r: 80, weapon: 85, hand_l_wrap: 91, hand_r_wrap: 92 },
    off_grip_released_in: ['victory', 'defeat', 'portrait'],
    off_grip_released_reason:
      'Same contract as the axe: victory is one-handed, defeat lets go with the rear hand.',
  },
  shield: {
    id: 'weapon_shield',
    slot: 'shield',
    w: 180,
    h: 200,
    grip: [90, 100],
    sockets: { grip_main: [90, 100] },
    parent: 'hand_l',
    attach_angle: 0,
    z: 66,
    hands: 'one',
    grip_style: 'off-hand',
    pose_src: 'sword',
    z_overrides: { hand_l_wrap: 68 },
    layering: { hand_l: 65, weapon: 66, hand_l_wrap: 68 },
  },
};

function manifestWeaponEntry(spec) {
  const grips = {
    main: {
      weapon_socket: 'grip_main',
      hand: spec.parent,
      hand_socket: 'grip',
      attach_angle: spec.attach_angle,
      offset: [0, 0],
    },
  };
  if (spec.sockets.grip_off) {
    grips.off = {
      weapon_socket: 'grip_off',
      hand: 'hand_l',
      hand_socket: 'grip',
      attach_angle: spec.attach_angle,
      offset: [0, 0],
    };
  }
  const rec = {
    asset: spec.id,
    hands: spec.hands,
    grips,
    layering: spec.layering,
    z_overrides: spec.z_overrides,
    draw_order_note: 'hand back layer < weapon < hand *_wrap layer for every gripping hand',
    grip_style: spec.grip_style,
    measure: { tile: [spec.w, spec.h] },
  };
  if (spec.off_grip_released_in) {
    rec.off_grip_released_in = spec.off_grip_released_in;
    rec.off_grip_released_reason = spec.off_grip_released_reason;
    rec.off_hand_rule =
      'hand_l is NOT parented to the weapon. Every pose ships baked hand_l rotations that land hand_l.grip on the weapon grip_off (validated ≤ 1.5 px / 2 deg). Defeat, victory and portrait release it.';
    rec.measure.hand_spacing_px = 78;
  }
  return rec;
}

function assetRecord(spec, paints) {
  const files = {};
  const files2x = {};
  for (const paint of paints) {
    files[paint] = `parts/${spec.id}-${paint}.png`;
    files2x[paint] = `parts@2x/${spec.id}-${paint}.png`;
  }
  return {
    id: spec.id,
    width: spec.w,
    height: spec.h,
    pivot: spec.grip,
    sockets: spec.sockets,
    slot: spec.slot,
    parent: spec.parent,
    parent_socket: 'grip',
    angle: spec.attach_angle,
    z: spec.z,
    motion_bounds: [-180, 180],
    role: 'weapon',
    compatible_family: 'workshop-frame-v003',
    source_file: `a4-weapons-v1/${spec.id}`,
    files,
    'files@2x': files2x,
    material_under: `materials/${spec.id}-under.png`,
    material_over: `materials/${spec.id}-over.png`,
    paint_mask: `masks/${spec.id}-paint.png`,
    'material_under@2x': `materials@2x/${spec.id}-under.png`,
    'material_over@2x': `materials@2x/${spec.id}-over.png`,
    'paint_mask@2x': `masks@2x/${spec.id}-paint.png`,
    // Melee/shield use mask tint (accent/main) like A4 weapons v1.
    has_paint: true,
  };
}

function main() {
  if (sha256(A6_ZIP) !== A6_SHA) fail(`A6 zip sha mismatch`);
  const a6Dir = join(TMP, 'a6');
  const weaponsDir = join(TMP, 'weapons');
  unzip(A6_ZIP, a6Dir);
  unzip(A4_WEAPONS_ZIP, weaponsDir);

  const a6Root = join(a6Dir, 'Botore-A6-patterns-tott-v1');
  const paintsPath = join(a6Root, 'paints.json');
  if (!existsSync(paintsPath)) fail('a6 paints.json missing');
  // A6 paints.json supersedes A4 v3 and includes solids + patterns.
  const paints = JSON.parse(readFileSync(paintsPath, 'utf8'));
  if (paints.pass !== 'v4') fail(`expected paints pass v4, got ${paints.pass}`);

  // Vendor paints.json + wear + carousel swatches into game assets.
  const paintPack = join(GAME_ASSETS, 'a6-paints-v4');
  ensureDir(paintPack);
  copyFileSync(paintsPath, join(paintPack, 'paints.json'));
  writeFileSync(
    join(paintPack, 'PROVENANCE.md'),
    [
      '# A6 paints v4 (vendored)',
      '',
      `Source zip: Botore-A6-patterns-tott-v1.zip`,
      `sha256: ${A6_SHA}`,
      `paints.json pass: ${paints.pass}`,
      `Ticket: A6 / E7`,
      '',
    ].join('\n'),
  );

  // Wear maps from A4 paints zip (unchanged in A6); fall back to a6 if present.
  const a4PaintsZip = join(STORE, 'Botore-A4-paints-v3.zip');
  if (existsSync(a4PaintsZip)) {
    unzip(a4PaintsZip, join(TMP, 'a4-paints'));
    const wearSrc = join(TMP, 'a4-paints', 'Botore-A4-paints-v3', 'wear');
    if (existsSync(wearSrc)) {
      cpSync(wearSrc, join(paintPack, 'wear'), { recursive: true });
    }
  }

  const swatchDest = join(GAME_ASSETS, 'customise-tiles', 'swatch');
  ensureDir(swatchDest);
  const swatchSrc = join(a6Root, 'tiles', 'swatch');
  for (const f of readdirSync(swatchSrc)) {
    copyFileSync(join(swatchSrc, f), join(swatchDest, f));
  }

  const glyphDest = join(GAME_ASSETS, 'customise-tiles', 'weapon');
  ensureDir(glyphDest);
  const weaponTileSrc = join(a6Root, 'tiles', 'tile-weapon');
  if (existsSync(weaponTileSrc)) {
    for (const f of readdirSync(weaponTileSrc)) {
      if (f.includes('@2x') || f.includes('@3x')) continue;
      if (!f.includes('-default')) continue;
      copyFileSync(join(weaponTileSrc, f), join(glyphDest, f));
    }
  }
  // Prefer mockup weapon icons when present (cleaner glyphs).
  const mockWeapons = join(STORE, 'mockups-apk-2026-11-18', 'assets');
  for (const id of ['mace', 'hammer', 'spear', 'shield', 'sword', 'axe', 'dagger']) {
    const src = join(mockWeapons, `w-${id}.png`);
    if (existsSync(src)) copyFileSync(src, join(glyphDest, `${id}.png`));
  }

  // a5fix NPC data + cobalt-brute portraits/renders
  const a5Dest = join(GAME_ASSETS, 'a5fix');
  ensureDir(a5Dest);
  copyFileSync(join(a6Root, 'a5fix', 'npcs.json'), join(a5Dest, 'npcs.json'));
  cpSync(join(a6Root, 'a5fix', 'portraits'), join(a5Dest, 'portraits'), { recursive: true });
  cpSync(join(a6Root, 'a5fix', 'renders'), join(a5Dest, 'renders'), { recursive: true });

  // Face-off layers for D9
  const tottDest = join(GAME_ASSETS, 'tott');
  ensureDir(tottDest);
  cpSync(join(a6Root, 'tott'), tottDest, { recursive: true });

  // Vendor weapons into kit materials/masks/parts
  const solidPaintIds = paints.solid_ids ?? [
    'oxide',
    'petrol',
    'primer',
    'ink',
    'drab',
    'cobalt',
    'frost',
    'cinder',
  ];
  const allPaintIds = paints.paint_ids;
  const weaponsRoot = existsSync(join(weaponsDir, 'parts'))
    ? weaponsDir
    : join(weaponsDir, readdirSync(weaponsDir)[0]);

  for (const [kind, spec] of Object.entries(WEAPON_SPECS)) {
    const src1 = join(weaponsRoot, 'parts', '1x', spec.id);
    const src2 = join(weaponsRoot, 'parts', '2x', spec.id);
    if (!existsSync(src1)) fail(`missing weapon parts ${src1}`);
    copyFileSync(join(src1, 'under.png'), join(KIT, 'materials', `${spec.id}-under.png`));
    copyFileSync(join(src1, 'over.png'), join(KIT, 'materials', `${spec.id}-over.png`));
    copyFileSync(join(src1, 'mask.png'), join(KIT, 'masks', `${spec.id}-paint.png`));
    copyFileSync(join(src2, 'under.png'), join(KIT, 'materials@2x', `${spec.id}-under.png`));
    copyFileSync(join(src2, 'over.png'), join(KIT, 'materials@2x', `${spec.id}-over.png`));
    copyFileSync(join(src2, 'mask.png'), join(KIT, 'masks@2x', `${spec.id}-paint.png`));
    for (const paint of solidPaintIds) {
      const p1 = join(src1, `${paint}.png`);
      const p2 = join(src2, `${paint}.png`);
      if (!existsSync(p1)) fail(`missing ${p1}`);
      copyFileSync(p1, join(KIT, 'parts', `${spec.id}-${paint}.png`));
      copyFileSync(p2, join(KIT, 'parts@2x', `${spec.id}-${paint}.png`));
    }
    // Pattern paints: reuse oxide painted fallback (mask tint / pattern fill handles look).
    for (const paint of ['hazard', 'racing']) {
      copyFileSync(join(src1, 'oxide.png'), join(KIT, 'parts', `${spec.id}-${paint}.png`));
      copyFileSync(join(src2, 'oxide.png'), join(KIT, 'parts@2x', `${spec.id}-${paint}.png`));
    }
  }

  // Merge weapon clips + smears
  const kitClipsPath = join(KIT, 'animation', 'clips.json');
  const packClipsPath = join(weaponsRoot, 'animation', 'clips.json');
  const kitClips = JSON.parse(readFileSync(kitClipsPath, 'utf8'));
  const packClips = JSON.parse(readFileSync(packClipsPath, 'utf8'));
  kitClips.clips = { ...kitClips.clips, ...packClips.clips };
  writeFileSync(kitClipsPath, `${JSON.stringify(kitClips, null, 2)}\n`);

  for (const scale of ['fx', 'fx@2x']) {
    const smearSrc = join(weaponsRoot, scale, 'smears');
    if (!existsSync(smearSrc)) continue;
    const smearDest = join(KIT, scale, 'smears');
    ensureDir(smearDest);
    for (const f of readdirSync(smearSrc)) {
      copyFileSync(join(smearSrc, f), join(smearDest, f));
    }
  }

  // Patch kit manifest
  const manifestPath = join(KIT, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.paint_ids = allPaintIds;
  manifest.paint_tokens = Object.fromEntries(
    Object.entries(paints.paint_tokens).map(([k, v]) => [k, String(v).toLowerCase()]),
  );
  // Keep oxide/petrol casing parity with prior kit (#e8771c).
  manifest.paint_tokens.oxide = '#e8771c';
  manifest.paint_tokens.petrol = '#27877b';

  // Extend existing body part files maps with new paint keys (fallback to oxide PNG).
  for (const asset of manifest.assets) {
    if (!asset.files) continue;
    for (const paint of allPaintIds) {
      if (!asset.files[paint]) {
        asset.files[paint] = asset.files.oxide ?? Object.values(asset.files)[0];
      }
      if (asset['files@2x'] && !asset['files@2x'][paint]) {
        asset['files@2x'][paint] = asset['files@2x'].oxide ?? Object.values(asset['files@2x'])[0];
      }
    }
  }

  // Inject weapon assets
  const existingIds = new Set(manifest.assets.map((a) => a.id));
  for (const [kind, spec] of Object.entries(WEAPON_SPECS)) {
    const rec = assetRecord(spec, allPaintIds);
    if (existingIds.has(rec.id)) {
      const idx = manifest.assets.findIndex((a) => a.id === rec.id);
      manifest.assets[idx] = rec;
    } else {
      manifest.assets.push(rec);
    }
    manifest.weapons[kind] = manifestWeaponEntry(spec);
  }

  // Pose tables: copy pose_src entries + apply overrides
  const overrides = JSON.parse(readFileSync(join(weaponsRoot, 'poses', 'overrides.json'), 'utf8'));
  for (const [pose, table] of Object.entries(manifest.poses)) {
    for (const [kind, spec] of Object.entries(WEAPON_SPECS)) {
      if (!table[kind] && table[spec.pose_src]) {
        table[kind] = structuredClone(table[spec.pose_src]);
      }
    }
  }
  for (const [pose, byW] of Object.entries(overrides)) {
    manifest.poses[pose] = manifest.poses[pose] ?? {};
    for (const [w, entry] of Object.entries(byW)) {
      manifest.poses[pose][w] = entry;
    }
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // Bake pattern fills via Python/Pillow
  const bakeScript = join(ROOT, 'scripts', 'bake-pattern-fills.py');
  const bake = spawnSync('python3', [bakeScript, paintsPath, KIT, paintPack], {
    encoding: 'utf8',
  });
  if (bake.status !== 0) {
    fail(`pattern bake failed:\n${bake.stdout}\n${bake.stderr}`);
  }
  console.log(bake.stdout.trim());
  console.log('E7-VENDOR-OK paints+weapons+patterns');
}

main();
