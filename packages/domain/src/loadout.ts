/**
 * Bots-as-data: framework-neutral loadout + catalogue types and validators.
 *
 * PURE PACKAGE — mirrors server SQL rules in save_bot_loadout without IO.
 * The Postgres function remains authoritative for persistence.
 */

/** Catalogue / loadout slots. Shield, drone, and decal are reserved extensions. */
export type PartSlotKind = 'chassis' | 'paint' | 'weapon' | 'shield' | 'drone' | 'decal';

/** Mirrors combat-v1 WeaponKind without importing from index (avoid cycles). */
export type LoadoutWeaponKind = 'sword' | 'axe' | 'dagger';

export const REQUIRED_LOADOUT_SLOTS = ['chassis', 'paint', 'weapon'] as const;
export type RequiredLoadoutSlot = (typeof REQUIRED_LOADOUT_SLOTS)[number];

export const EXTENSION_LOADOUT_SLOTS = ['shield', 'drone', 'decals'] as const;

export const MAX_DECALS = 8;

/** Confirmed bot loadout shape stored in bot_loadout_versions.loadout. */
export interface BotLoadout {
  readonly chassis: string;
  readonly paint: string;
  readonly weapon: string;
  readonly shield: string | null;
  readonly drone: string | null;
  readonly decals: readonly string[];
  readonly soundTags: readonly string[];
}

/** Catalogue part row (subset shared with clients). */
export interface CataloguePart {
  readonly partId: string;
  readonly slotKind: PartSlotKind;
  readonly displayName: string;
  readonly weaponKind: LoadoutWeaponKind | null;
  readonly weaponPower: number | null;
  readonly soundTags: readonly string[];
  readonly compatibility: Readonly<Record<string, unknown>>;
  readonly mediaKey: string;
  readonly isActive: boolean;
}

export type LoadoutValidationErrorCode =
  | 'invalid_loadout'
  | 'missing_slot'
  | 'unknown_part'
  | 'inactive_part'
  | 'slot_mismatch'
  | 'unowned_part'
  | 'too_many_decals'
  | 'invalid_atlas_version';

export interface LoadoutValidationError {
  readonly code: LoadoutValidationErrorCode;
  readonly message: string;
}

export type LoadoutValidationResult =
  | { readonly ok: true; readonly loadout: BotLoadout }
  | { readonly ok: false; readonly errors: readonly LoadoutValidationError[] };

export interface ValidateLoadoutInput {
  readonly loadout: unknown;
  readonly catalogue: ReadonlyMap<string, CataloguePart>;
  /** Part ids the account owns with quantity >= 1. Opponents skip ownership. */
  readonly ownedPartIds: ReadonlySet<string>;
  readonly requireOwnership: boolean;
  readonly atlasVersion?: string;
}

const ATLAS_VERSION_RE = /^v[0-9]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalPartId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Validate a proposed loadout against catalogue + ownership rules.
 * Does not mutate catalogue or inventory; pure check for client/server reuse.
 */
export function validateBotLoadout(input: ValidateLoadoutInput): LoadoutValidationResult {
  const errors: LoadoutValidationError[] = [];
  const atlasVersion = input.atlasVersion ?? 'v1';
  if (!ATLAS_VERSION_RE.test(atlasVersion)) {
    errors.push({
      code: 'invalid_atlas_version',
      message: `atlas version must match vN, got ${atlasVersion}`,
    });
  }

  if (!isPlainObject(input.loadout)) {
    return {
      ok: false,
      errors: [...errors, { code: 'invalid_loadout', message: 'loadout must be a JSON object' }],
    };
  }

  const raw = input.loadout;
  const chassis = typeof raw['chassis'] === 'string' ? raw['chassis'] : null;
  const paint = typeof raw['paint'] === 'string' ? raw['paint'] : null;
  const weapon = typeof raw['weapon'] === 'string' ? raw['weapon'] : null;

  if (!chassis) errors.push({ code: 'missing_slot', message: 'missing required slot chassis' });
  if (!paint) errors.push({ code: 'missing_slot', message: 'missing required slot paint' });
  if (!weapon) errors.push({ code: 'missing_slot', message: 'missing required slot weapon' });

  const shield = readOptionalPartId(raw['shield']);
  const drone = readOptionalPartId(raw['drone']);
  if (raw['shield'] !== undefined && shield === undefined) {
    errors.push({ code: 'invalid_loadout', message: 'shield must be a string or null' });
  }
  if (raw['drone'] !== undefined && drone === undefined) {
    errors.push({ code: 'invalid_loadout', message: 'drone must be a string or null' });
  }

  let decals: string[] = [];
  if (raw['decals'] !== undefined) {
    if (!Array.isArray(raw['decals']) || raw['decals'].some((d) => typeof d !== 'string')) {
      errors.push({ code: 'invalid_loadout', message: 'decals must be an array of part ids' });
    } else {
      decals = raw['decals'] as string[];
      if (decals.length > MAX_DECALS) {
        errors.push({
          code: 'too_many_decals',
          message: `at most ${MAX_DECALS} decals`,
        });
      }
    }
  }

  const assertSlot = (partId: string | null | undefined, slot: PartSlotKind): void => {
    if (!partId) return;
    const part = input.catalogue.get(partId);
    if (!part) {
      errors.push({ code: 'unknown_part', message: `unknown part ${partId}` });
      return;
    }
    if (!part.isActive) {
      errors.push({ code: 'inactive_part', message: `inactive part ${partId}` });
    }
    if (part.slotKind !== slot) {
      errors.push({
        code: 'slot_mismatch',
        message: `part ${partId} is ${part.slotKind} but expected ${slot}`,
      });
    }
    if (input.requireOwnership && !input.ownedPartIds.has(partId)) {
      errors.push({ code: 'unowned_part', message: `account does not own ${partId}` });
    }
  };

  assertSlot(chassis, 'chassis');
  assertSlot(paint, 'paint');
  assertSlot(weapon, 'weapon');
  if (shield) assertSlot(shield, 'shield');
  if (drone) assertSlot(drone, 'drone');
  for (const decal of decals) assertSlot(decal, 'decal');

  let soundTags: string[] = [];
  if (raw['soundTags'] !== undefined) {
    if (!Array.isArray(raw['soundTags']) || raw['soundTags'].some((t) => typeof t !== 'string')) {
      errors.push({ code: 'invalid_loadout', message: 'soundTags must be an array of strings' });
    } else {
      soundTags = raw['soundTags'] as string[];
    }
  } else if (chassis && weapon) {
    const tagSet = new Set<string>();
    for (const id of [chassis, weapon, shield, drone]) {
      if (!id) continue;
      const part = input.catalogue.get(id);
      if (!part) continue;
      for (const tag of part.soundTags) tagSet.add(tag);
    }
    soundTags = [...tagSet].sort();
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    loadout: {
      chassis: chassis!,
      paint: paint!,
      weapon: weapon!,
      shield: shield ?? null,
      drone: drone ?? null,
      decals,
      soundTags,
    },
  };
}

/** Map a confirmed loadout weapon part to combat-v1 weapon fields. */
export function loadoutWeaponFromCatalogue(
  loadout: BotLoadout,
  catalogue: ReadonlyMap<string, CataloguePart>,
): { kind: LoadoutWeaponKind; power: number } | null {
  const part = catalogue.get(loadout.weapon);
  if (!part || part.slotKind !== 'weapon' || !part.weaponKind || part.weaponPower === null) {
    return null;
  }
  return { kind: part.weaponKind, power: part.weaponPower };
}

/** Combat build stats used with a confirmed loadout weapon (F2 snapshots). */
export interface CombatBuildStats {
  readonly characterId: string;
  readonly displayName: string;
  readonly hp: number;
  readonly strength: number;
  readonly agility: number;
  readonly speed: number;
}

/**
 * Assemble an immutable combat-v1 fighter snapshot from build stats + loadout
 * weapon. Pure helper mirrored by prepare_fight_context SQL for the Edge path.
 */
export function fighterSnapshotFromBuildAndLoadout(
  build: CombatBuildStats,
  loadout: BotLoadout,
  catalogue: ReadonlyMap<string, CataloguePart>,
): {
  characterId: string;
  displayName: string;
  hp: number;
  strength: number;
  agility: number;
  speed: number;
  weaponKind: LoadoutWeaponKind;
  weaponPower: number;
} | null {
  const weapon = loadoutWeaponFromCatalogue(loadout, catalogue);
  if (!weapon) return null;
  return {
    characterId: build.characterId,
    displayName: build.displayName,
    hp: build.hp,
    strength: build.strength,
    agility: build.agility,
    speed: build.speed,
    weaponKind: weapon.kind,
    weaponPower: weapon.power,
  };
}
