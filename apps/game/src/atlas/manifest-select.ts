import type { AtlasManifestEntryDto, AtlasManifestResponse } from '@botore/contracts';
import { canonicalAtlasPartId, isWorkshopFrameAtlasPath } from './workshop-frame-paths';
import { BUNDLED_BASE_AUDIO_PATHS, type EnsurePacksRequest } from './types';

const BUNDLED_PATH_SET = new Set(Object.values(BUNDLED_BASE_AUDIO_PATHS));

/**
 * Decide which manifest entries the loader should materialize for a fight/stable.
 * Bundled base-pack audio is never queued for download — it ships in the app.
 *
 * Workshop Frame kit-v002 rows use F5 `parts/<partId>/…` (or kits/…/v002 fallback)
 * and are selected when their partId is requested — same entry shape as other packs.
 */
export function selectEntriesToFetch(
  manifest: AtlasManifestResponse,
  request: EnsurePacksRequest,
): AtlasManifestEntryDto[] {
  const partSet = new Set(request.partIds);
  const includeArena = request.includeArena !== false;
  const includeFx = request.includeFx !== false;

  return manifest.entries.filter((entry) => {
    if (entry.kind === 'manifest') return false;
    if (BUNDLED_PATH_SET.has(entry.path)) return false;
    // Visible build pins kit-v002 — never select workshop-frame v001 objects.
    if (entry.path.includes('workshop-frame/v001/')) {
      return false;
    }

    if (entry.partId) {
      return partSet.has(entry.partId) || partSet.has(canonicalAtlasPartId(entry.partId));
    }

    if (isWorkshopFrameAtlasPath(entry.path)) {
      const leaf = kitPartIdFromAtlasPath(entry.path);
      return leaf !== null && (partSet.has(leaf) || partSet.has(canonicalAtlasPartId(leaf)));
    }

    if (entry.path.startsWith('arenas/')) {
      return includeArena;
    }
    if (entry.path.startsWith('fx/')) {
      return includeFx;
    }

    if (entry.path.startsWith('base/')) {
      return false;
    }

    return false;
  });
}

/** Extract hyphenated partId from packed atlas path `parts/<partId>/…`. */
function kitPartIdFromAtlasPath(path: string): string | null {
  const packed = /^parts\/([^/]+)\//.exec(path);
  if (packed) return packed[1]!;
  // kits/workshop-frame/v002/parts/torso-oxide.png → torso (then hyphenate at call site)
  const base = path.split('/').pop();
  if (!base) return null;
  const stem = base.replace(/\.[^.]+$/, '');
  const cut = stem.replace(/-(oxide|petrol|under|over|paint)$/, '');
  return cut.length > 0 ? cut : null;
}

export function storagePathForEntry(
  manifest: AtlasManifestResponse,
  entry: AtlasManifestEntryDto,
): string {
  if (entry.storagePath && entry.storagePath.length > 0) {
    return entry.storagePath;
  }
  return `${manifest.prefix}${entry.path}`.replace(/\/{2,}/g, '/');
}
