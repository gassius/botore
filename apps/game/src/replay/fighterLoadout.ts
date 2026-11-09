/**
 * Map sealed fight builds → BotAssembler loadout input.
 * Never derive paint from scene slot paintAlias — historical builds are authoritative.
 */
import type { FighterSnapshot } from '@botore/replay';
import type { AssemblerLoadoutInput } from '../assembler';

export interface SealedBotBuild {
  readonly chassis: string;
  readonly paint: string;
  readonly weapon: string;
  readonly shield?: string | null;
  readonly drone?: string | null;
  readonly decals?: readonly string[];
  readonly soundTags?: readonly string[];
  readonly loadoutVersionId?: string | null;
  readonly atlasVersion?: string;
}

export interface SealedFightBuilds {
  readonly attacker: SealedBotBuild;
  readonly defender: SealedBotBuild;
}

export function weaponIdFromKind(kind: FighterSnapshot['weaponKind']): string {
  if (kind === 'axe') return 'weapon-axe';
  if (kind === 'dagger') return 'weapon-dagger';
  return 'weapon-sword';
}

export function weaponKindFromId(weaponId: string): FighterSnapshot['weaponKind'] {
  if (weaponId === 'weapon-axe' || weaponId === 'axe') return 'axe';
  if (weaponId === 'weapon-dagger' || weaponId === 'dagger') return 'dagger';
  return 'sword';
}

/** Assembler input from an authoritative sealed build (not scene placement). */
export function assemblerLoadoutFromBuild(build: SealedBotBuild): AssemblerLoadoutInput {
  return {
    chassis: build.chassis,
    paint: build.paint,
    weapon: build.weapon,
    ...(build.shield !== undefined ? { shield: build.shield } : {}),
    ...(build.drone !== undefined ? { drone: build.drone } : {}),
    ...(build.decals ? { decals: build.decals } : {}),
    ...(build.soundTags ? { soundTags: build.soundTags } : {}),
  };
}

/**
 * DEV / fixture sealed builds. Paints are intentional and opposite the
 * environment illustrative scene aliases (near=oxide, far=petrol) so tests
 * prove rendering follows stored builds, not scene slots.
 */
export function sealedBuildsForDevReplay(
  fighters: readonly [FighterSnapshot, FighterSnapshot],
): SealedFightBuilds {
  return {
    attacker: {
      chassis: 'chassis-basic',
      paint: 'paint-cobalt',
      weapon: weaponIdFromKind(fighters[0].weaponKind),
      shield: null,
      drone: null,
      decals: [],
      soundTags: ['chassis.light', `weapon.${fighters[0].weaponKind}`],
      loadoutVersionId: 'dev-attacker-build',
      atlasVersion: 'v1',
    },
    defender: {
      chassis: 'chassis-basic',
      paint: 'paint-crimson',
      weapon: weaponIdFromKind(fighters[1].weaponKind),
      shield: null,
      drone: null,
      decals: [],
      soundTags: ['chassis.light', `weapon.${fighters[1].weaponKind}`],
      loadoutVersionId: 'dev-defender-build',
      atlasVersion: 'v1',
    },
  };
}

/** @deprecated Prefer assemblerLoadoutFromBuild(sealed). Kept for call-site migration. */
export function loadoutFromFighter(
  fighter: FighterSnapshot,
  _placementIgnored?: { paintAlias?: string },
): AssemblerLoadoutInput {
  return {
    chassis: 'chassis-basic',
    paint: 'paint-cobalt',
    weapon: weaponIdFromKind(fighter.weaponKind),
  };
}
