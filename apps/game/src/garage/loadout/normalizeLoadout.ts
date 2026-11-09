import type { GarageLoadout } from './loadoutTypes';
import { DEFAULT_CONFIRMED_LOADOUT, soundTagsFor } from './proofCatalogue';

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

/** Accept camelCase or snake_case jsonb from RPC / views. */
export function normalizeGarageLoadout(raw: unknown): GarageLoadout {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_CONFIRMED_LOADOUT;
  }
  const row = raw as Record<string, unknown>;
  const chassis = asString(row.chassis) ?? DEFAULT_CONFIRMED_LOADOUT.chassis;
  const paint = asString(row.paint) ?? DEFAULT_CONFIRMED_LOADOUT.paint;
  const weapon = asString(row.weapon) ?? DEFAULT_CONFIRMED_LOADOUT.weapon;
  const shield = asString(row.shield);
  const drone = asString(row.drone);
  const decals = asStringArray(row.decals);
  const soundTagsRaw = row.soundTags ?? row.sound_tags;
  const soundTags =
    asStringArray(soundTagsRaw).length > 0
      ? asStringArray(soundTagsRaw)
      : soundTagsFor({ chassis, weapon });

  return {
    chassis,
    paint,
    weapon,
    shield,
    drone,
    decals,
    soundTags,
  };
}
