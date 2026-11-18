/**
 * Workshop Frame kit-v003 → F5 atlas path coordination (F6 / A1).
 *
 * Visible-build pin: **v003.3** (family workshop-frame-v003). Do not mix
 * v002/v001 coordinates or assets.
 * Kit local `manifest.json` (`botore.workshop-frame.provisional.v2`) remains a
 * media-adapter for F7 — not a competing Storage/wire schema. Pack fetch/cache
 * still uses F5 `get_atlas_manifest` entries.
 *
 * Atlas packing recipe (F5 `parts/<partId>/…`, hyphenated partIds):
 *   parts/{assetId}-{paint}.png     → parts/{partId}/{paint}.png
 *   materials/{assetId}-under.png   → parts/{partId}/material-under.png
 *   materials/{assetId}-over.png    → parts/{partId}/material-over.png
 *   masks/{assetId}-paint.png       → parts/{partId}/mask.png
 *
 * Kit asset ids keep underscores (`weapon_sword`); atlas/catalogue partIds use
 * hyphens (`weapon-sword`). F7 paint/weapon aliases map here. Do not edit F5.
 */

export const WORKSHOP_FRAME_KIT = {
  kitId: 'workshop-frame',
  /** Atlas path namespace stays v003; Metro pin is kit version v003.3. */
  kitVersion: 'v003',
  compatibleFamily: 'workshop-frame-v003',
  /** Local kit tree name F7 mounts under apps/game/assets/. */
  localAssetDir: 'workshop-frame-kit-v003',
  pinVersion: 'v003.3',
} as const;

/**
 * Single Development atlas pack: proof catalogue + Workshop Frame kit-v003
 * media keys (BT-171). Fight/stable pin `v1`; former v2/v3 packs are retired.
 */
export const WORKSHOP_FRAME_ATLAS_VERSION = 'v1';

/** Body + limb kit asset ids (15). Wraps and weapons are separate. */
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
] as const;

export type WorkshopFrameBodyAssetId = (typeof WORKSHOP_FRAME_BODY_ASSET_IDS)[number];

/** Finger wrap layers (v003) — always drawn; children of hand_* at socket wrap. */
export const WORKSHOP_FRAME_WRAP_ASSET_IDS = ['hand_l_wrap', 'hand_r_wrap'] as const;

export type WorkshopFrameWrapAssetId = (typeof WORKSHOP_FRAME_WRAP_ASSET_IDS)[number];

export const WORKSHOP_FRAME_WEAPON_ASSET_IDS = [
  'weapon_sword',
  'weapon_axe',
  'weapon_dagger',
  'weapon_mace',
  'weapon_hammer',
  'weapon_spear',
  'weapon_shield',
] as const;

export type WorkshopFrameWeaponAssetId = (typeof WORKSHOP_FRAME_WEAPON_ASSET_IDS)[number];

export type WorkshopFramePaintToken =
  | 'oxide'
  | 'petrol'
  | 'primer'
  | 'ink'
  | 'drab'
  | 'cobalt'
  | 'frost'
  | 'cinder'
  | 'hazard'
  | 'racing';

const PAINT_TOKEN_SET = new Set<string>([
  'oxide',
  'petrol',
  'primer',
  'ink',
  'drab',
  'cobalt',
  'frost',
  'cinder',
  'hazard',
  'racing',
]);

/** Catalogue id → A6 paint token (cobalt visual uses paint-navy). */
const CATALOGUE_TO_TOKEN: Readonly<Record<string, WorkshopFramePaintToken>> = {
  'paint-crimson': 'oxide',
  'paint-cobalt': 'petrol',
  'paint-oxide': 'oxide',
  'paint-petrol': 'petrol',
  'paint-primer': 'primer',
  'paint-ink': 'ink',
  'paint-drab': 'drab',
  'paint-navy': 'cobalt',
  'paint-frost': 'frost',
  'paint-cinder': 'cinder',
  'paint-hazard': 'hazard',
  'paint-racing': 'racing',
};

const TOKEN_TO_CATALOGUE: Readonly<Record<WorkshopFramePaintToken, string>> = {
  oxide: 'paint-crimson',
  petrol: 'paint-cobalt',
  primer: 'paint-primer',
  ink: 'paint-ink',
  drab: 'paint-drab',
  cobalt: 'paint-navy',
  frost: 'paint-frost',
  cinder: 'paint-cinder',
  hazard: 'paint-hazard',
  racing: 'paint-racing',
};

/**
 * Canonical atlas / catalogue partId (hyphenated).
 * Kit media filenames keep underscores; F5 paths use this form.
 */
export function canonicalAtlasPartId(kitOrCatalogueId: string): string {
  return kitOrCatalogueId.trim().toLowerCase().replace(/_/g, '-');
}

/**
 * Shared UI/rig contract aliases (client-only).
 * Legacy: Oxide ↔ paint-crimson, Petrol ↔ paint-cobalt.
 * A6 v4: primer…racing; cobalt visual ↔ paint-navy.
 */
export function resolvePaintToken(paintId: string | null | undefined): WorkshopFramePaintToken {
  const id = (paintId ?? '').trim().toLowerCase();
  if (!id) return 'oxide';
  if (CATALOGUE_TO_TOKEN[id]) return CATALOGUE_TO_TOKEN[id]!;
  if (PAINT_TOKEN_SET.has(id)) return id as WorkshopFramePaintToken;
  return 'oxide';
}

export function resolvePaintCatalogueId(paintId: string | null | undefined): string {
  return TOKEN_TO_CATALOGUE[resolvePaintToken(paintId)];
}

/** Map F7/catalogue weapon id → kit asset id (underscore form in kit files). */
export function resolveWorkshopWeaponAssetId(
  weaponId: string | null | undefined,
): WorkshopFrameWeaponAssetId {
  const id = (weaponId ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (id === 'axe' || id === 'weapon_axe') return 'weapon_axe';
  if (id === 'dagger' || id === 'weapon_dagger') return 'weapon_dagger';
  if (id === 'mace' || id === 'weapon_mace') return 'weapon_mace';
  if (id === 'hammer' || id === 'weapon_hammer') return 'weapon_hammer';
  if (id === 'spear' || id === 'weapon_spear') return 'weapon_spear';
  if (id === 'shield' || id === 'weapon_shield') return 'weapon_shield';
  return 'weapon_sword';
}

/** Map kit/F7 weapon → existing F5 proof-pack catalogue partId (hyphenated). */
export function resolveWeaponCatalogueId(weaponId: string | null | undefined): string {
  return canonicalAtlasPartId(resolveWorkshopWeaponAssetId(weaponId));
}

/**
 * Map a kit-local relative path onto an F5 pack-relative Storage path.
 * Rejects accidental v001 prefixes — visible build is v003 only.
 */
export function atlasPathForWorkshopKitFile(kitRelativePath: string): string {
  const cleaned = kitRelativePath.replace(/^\/+/, '');
  if (cleaned.includes('/v001/') || cleaned.startsWith('v001/')) {
    throw new Error('workshop_frame_v001_forbidden: visible build pins kit-v003 only');
  }

  const partsMatch =
    /^parts\/([^/]+)-(oxide|petrol|primer|ink|drab|cobalt|frost|cinder|hazard|racing)\.png$/i.exec(
      cleaned,
    );
  if (partsMatch) {
    const partId = canonicalAtlasPartId(partsMatch[1]!);
    const paint = partsMatch[2]!.toLowerCase();
    return `parts/${partId}/${paint}.png`;
  }

  const materialMatch = /^materials\/([^/]+)-(under|over)\.png$/i.exec(cleaned);
  if (materialMatch) {
    const partId = canonicalAtlasPartId(materialMatch[1]!);
    const layer = materialMatch[2]!.toLowerCase();
    return `parts/${partId}/material-${layer}.png`;
  }

  const maskMatch = /^masks\/([^/]+)-paint\.png$/i.exec(cleaned);
  if (maskMatch) {
    const partId = canonicalAtlasPartId(maskMatch[1]!);
    return `parts/${partId}/mask.png`;
  }

  // Fallback: namespace leftover kit paths under kits/workshop-frame/v003/ so they
  // never collide with the F5 proof pack layout.
  return `kits/workshop-frame/v003/${cleaned}`;
}

/**
 * Kit files F6 should materialize for one workshop-frame asset (composited
 * paint PNG + material/mask layers). Paths are F5 pack-relative.
 */
export function workshopFrameAtlasPathsForAsset(
  assetId: string,
  paintToken: WorkshopFramePaintToken,
): readonly string[] {
  return [
    atlasPathForWorkshopKitFile(`parts/${assetId}-${paintToken}.png`),
    atlasPathForWorkshopKitFile(`materials/${assetId}-under.png`),
    atlasPathForWorkshopKitFile(`materials/${assetId}-over.png`),
    atlasPathForWorkshopKitFile(`masks/${assetId}-paint.png`),
  ];
}

/**
 * partIds for AtlasPackLoader.ensurePacks (hyphenated atlas ids + catalogue).
 * Includes body assets + wraps + selected weapon, plus F5 proof-pack paint/weapon ids.
 */
export function partIdsForWorkshopFrameLoadout(input: {
  chassis?: string | null;
  paint?: string | null;
  paintId?: string | null;
  weapon?: string | null;
  weaponId?: string | null;
}): string[] {
  const paint = input.paintId ?? input.paint;
  const weapon = input.weaponId ?? input.weapon;
  const weaponKit = resolveWorkshopWeaponAssetId(weapon);
  const ids = new Set<string>([
    ...WORKSHOP_FRAME_BODY_ASSET_IDS.map(canonicalAtlasPartId),
    ...WORKSHOP_FRAME_WRAP_ASSET_IDS.map(canonicalAtlasPartId),
    canonicalAtlasPartId(weaponKit),
    resolveWeaponCatalogueId(weapon),
    resolvePaintCatalogueId(paint),
    input.chassis?.trim() || 'chassis-basic',
  ]);
  return Array.from(ids);
}

/**
 * True when an F5 manifest entry path is a workshop-frame kit-v003 object.
 * Matches the packing recipe under parts/<hyphenatedId>/… or the kits/ fallback.
 */
export function isWorkshopFrameAtlasPath(packRelativePath: string): boolean {
  if (packRelativePath.startsWith('kits/workshop-frame/v003/')) return true;
  if (
    packRelativePath.includes('/v001/') ||
    packRelativePath.startsWith('kits/workshop-frame/v001/')
  ) {
    return false;
  }
  // Hyphenated body/wrap/weapon part folders produced by the packing recipe.
  const m = /^parts\/([^/]+)\//.exec(packRelativePath);
  if (!m) return false;
  const partId = m[1]!;
  const known = new Set([
    ...WORKSHOP_FRAME_BODY_ASSET_IDS.map(canonicalAtlasPartId),
    ...WORKSHOP_FRAME_WRAP_ASSET_IDS.map(canonicalAtlasPartId),
    ...WORKSHOP_FRAME_WEAPON_ASSET_IDS.map(canonicalAtlasPartId),
  ]);
  return known.has(partId);
}
