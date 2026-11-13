/**
 * Shared Workshop Frame kit-v002 → atlas/vN packing recipe (C13).
 *
 * Mirrors apps/game/src/atlas/workshop-frame-paths.ts:
 *   parts/{assetId}-{paint}.png   → parts/{partId}/{paint}.png
 *   materials/{assetId}-under.png → parts/{partId}/material-under.png
 *   materials/{assetId}-over.png  → parts/{partId}/material-over.png
 *   masks/{assetId}-paint.png     → parts/{partId}/mask.png
 *
 * Kit filenames keep underscores (`weapon_sword`); atlas/catalogue partIds use
 * hyphens (`weapon-sword`). Do not mix kit-v001 paths.
 */

export const WORKSHOP_FRAME_ATLAS_VERSION = 'v2';
export const WORKSHOP_FRAME_KIT_VERSION = 'v002';

export const WORKSHOP_FRAME_BODY_ASSET_IDS = [
  'torso',
  'head',
  'pelvis',
  'upper_arm_l',
  'forearm_l',
  'hand_l',
  'thigh_l',
  'shin_l',
  'foot_l',
  'upper_arm_r',
  'forearm_r',
  'hand_r',
  'thigh_r',
  'shin_r',
  'foot_r',
];

export const WORKSHOP_FRAME_WEAPON_ASSET_IDS = ['weapon_sword', 'weapon_axe', 'weapon_dagger'];

export const WORKSHOP_FRAME_PAINT_TOKENS = ['oxide', 'petrol'];

/** Kit asset id (may use underscores) → hyphenated atlas partId. */
export function canonicalAtlasPartId(kitOrCatalogueId) {
  return String(kitOrCatalogueId ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

/**
 * Map a kit-local relative path onto an F5 pack-relative Storage path.
 * Rejects accidental v001 prefixes.
 */
export function atlasPathForWorkshopKitFile(kitRelativePath) {
  const cleaned = String(kitRelativePath).replace(/^\/+/, '');
  if (cleaned.includes('/v001/') || cleaned.startsWith('v001/')) {
    throw new Error('workshop_frame_v001_forbidden: visible build pins kit-v002 only');
  }

  const partsMatch = /^parts\/([^/]+)-(oxide|petrol)\.png$/i.exec(cleaned);
  if (partsMatch) {
    const partId = canonicalAtlasPartId(partsMatch[1]);
    const paint = partsMatch[2].toLowerCase();
    return `parts/${partId}/${paint}.png`;
  }

  const materialMatch = /^materials\/([^/]+)-(under|over)\.png$/i.exec(cleaned);
  if (materialMatch) {
    const partId = canonicalAtlasPartId(materialMatch[1]);
    const layer = materialMatch[2].toLowerCase();
    return `parts/${partId}/material-${layer}.png`;
  }

  const maskMatch = /^masks\/([^/]+)-paint\.png$/i.exec(cleaned);
  if (maskMatch) {
    const partId = canonicalAtlasPartId(maskMatch[1]);
    return `parts/${partId}/mask.png`;
  }

  return `kits/workshop-frame/v002/${cleaned}`;
}

/** All kit-relative source → atlas destination pairs for the workshop-frame pack. */
export function workshopFrameKitPackPairs() {
  const assetIds = [...WORKSHOP_FRAME_BODY_ASSET_IDS, ...WORKSHOP_FRAME_WEAPON_ASSET_IDS];
  /** @type {{ kitRelative: string, atlasRelative: string, partId: string, role: string, assetKey: string }[]} */
  const pairs = [];
  for (const assetId of assetIds) {
    const partId = canonicalAtlasPartId(assetId);
    for (const paint of WORKSHOP_FRAME_PAINT_TOKENS) {
      const kitRelative = `parts/${assetId}-${paint}.png`;
      pairs.push({
        kitRelative,
        atlasRelative: atlasPathForWorkshopKitFile(kitRelative),
        partId,
        role: paint,
        assetKey: `parts.${partId}.${paint}`,
      });
    }
    for (const layer of ['under', 'over']) {
      const kitRelative = `materials/${assetId}-${layer}.png`;
      pairs.push({
        kitRelative,
        atlasRelative: atlasPathForWorkshopKitFile(kitRelative),
        partId,
        role: `material_${layer}`,
        assetKey: `parts.${partId}.material_${layer}`,
      });
    }
    {
      const kitRelative = `masks/${assetId}-paint.png`;
      pairs.push({
        kitRelative,
        atlasRelative: atlasPathForWorkshopKitFile(kitRelative),
        partId,
        role: 'mask',
        assetKey: `parts.${partId}.mask`,
      });
    }
  }
  return pairs;
}

/** Carry-forward proof-pack relative paths from atlas/v1 (base / arena / FX / catalogue). */
export const V1_CARRY_FORWARD_PATHS = [
  'manifest.json',
  'base/audio/ui-tap.m4a',
  'base/audio/music-loop.m4a',
  'base/audio/hit.m4a',
  'base/audio/dodge.m4a',
  'base/audio/defeat.m4a',
  'base/audio/hush.m4a',
  'base/audio/win.m4a',
  'base/audio/swing.m4a',
  'arenas/quiet/bg.png',
  'arenas/quiet/ambient.m4a',
  'fx/hit.png',
  'fx/dodge.png',
  'fx/defeat.png',
  'parts/chassis-basic/body.png',
  'parts/chassis-basic/mask.png',
  'parts/chassis-basic/hit.m4a',
  'parts/paint-crimson/swatch.png',
  'parts/paint-cobalt/swatch.png',
  'parts/weapon-sword/sprite.png',
  'parts/weapon-sword/swing.m4a',
  'parts/weapon-axe/sprite.png',
  'parts/weapon-axe/swing.m4a',
  'parts/weapon-dagger/sprite.png',
  'parts/weapon-dagger/swing.m4a',
];
