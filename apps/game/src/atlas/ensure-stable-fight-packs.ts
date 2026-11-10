/**
 * Stable / fight ensurePacks orchestration (C13).
 *
 * Downloads only the parts for bots in the player's stable or current fight —
 * never the future catalogue. Fight pins `atlasVersion` from the sealed loadout
 * (same as today); offline same-version cache still wins.
 */

import { AtlasPackLoader } from './pack-loader';
import {
  WORKSHOP_FRAME_ATLAS_VERSION,
  partIdsForWorkshopFrameLoadout,
} from './workshop-frame-paths';
import type { EnsurePacksRequest, EnsurePacksResult, PackTransport } from './types';

export type StableFightLoadoutSlots = {
  readonly chassis?: string | null;
  readonly paint?: string | null;
  readonly weapon?: string | null;
};

export type EnsureStableFightPacksInput = {
  readonly atlasVersion: string;
  readonly loadouts: readonly StableFightLoadoutSlots[];
  readonly transport: PackTransport;
  readonly loader: AtlasPackLoader;
  readonly includeArena?: boolean;
  readonly includeFx?: boolean;
  readonly allowOffline?: boolean;
};

/**
 * Union partIds across stable + fight bots, then ensure the pinned atlas pack.
 */
export async function ensureStableFightPacks(
  input: EnsureStableFightPacksInput,
): Promise<EnsurePacksResult> {
  const partIds = new Set<string>();
  for (const loadout of input.loadouts) {
    const slots: {
      chassis?: string | null;
      paint?: string | null;
      weapon?: string | null;
    } = {};
    if (loadout.chassis !== undefined) slots.chassis = loadout.chassis;
    if (loadout.paint !== undefined) slots.paint = loadout.paint;
    if (loadout.weapon !== undefined) slots.weapon = loadout.weapon;
    for (const id of partIdsForWorkshopFrameLoadout(slots)) {
      partIds.add(id);
    }
  }

  const request: EnsurePacksRequest = {
    atlasVersion: input.atlasVersion || WORKSHOP_FRAME_ATLAS_VERSION,
    partIds: Array.from(partIds),
  };
  if (input.includeArena !== undefined) request.includeArena = input.includeArena;
  if (input.includeFx !== undefined) request.includeFx = input.includeFx;
  if (input.allowOffline !== undefined) request.allowOffline = input.allowOffline;

  return input.loader.ensurePacks(request);
}

export function defaultAtlasVersionForWorkshopFrame(
  pinned: string | null | undefined,
): string {
  const v = (pinned ?? '').trim();
  return v.length > 0 ? v : WORKSHOP_FRAME_ATLAS_VERSION;
}
