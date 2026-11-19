import { describe, it, expect } from 'vitest';
import {
  MAX_DECALS,
  STOCK_SHAPE_PART_IDS,
  validateBotLoadout,
  loadoutWeaponFromCatalogue,
  fighterSnapshotFromBuildAndLoadout,
  type CataloguePart,
  type BotLoadout,
} from '../src/index.js';

function part(
  partial: Omit<CataloguePart, 'compatibility' | 'isActive'> & Partial<CataloguePart>,
): CataloguePart {
  return {
    compatibility: {},
    isActive: true,
    ...partial,
  };
}

const PROOF: CataloguePart[] = [
  part({
    partId: 'chassis-basic',
    slotKind: 'chassis',
    displayName: 'Basic Frame',
    weaponKind: null,
    weaponPower: null,
    soundTags: ['chassis.light'],
    mediaKey: 'parts/chassis-basic',
  }),
  part({
    partId: 'paint-crimson',
    slotKind: 'paint',
    displayName: 'Crimson',
    weaponKind: null,
    weaponPower: null,
    soundTags: [],
    mediaKey: 'parts/paint-crimson',
  }),
  part({
    partId: 'paint-cobalt',
    slotKind: 'paint',
    displayName: 'Cobalt',
    weaponKind: null,
    weaponPower: null,
    soundTags: [],
    mediaKey: 'parts/paint-cobalt',
  }),
  part({
    partId: 'weapon-sword',
    slotKind: 'weapon',
    displayName: 'Sword',
    weaponKind: 'sword',
    weaponPower: 3,
    soundTags: ['weapon.sword'],
    mediaKey: 'parts/weapon-sword',
  }),
  part({
    partId: 'weapon-axe',
    slotKind: 'weapon',
    displayName: 'Axe',
    weaponKind: 'axe',
    weaponPower: 5,
    soundTags: ['weapon.axe'],
    mediaKey: 'parts/weapon-axe',
  }),
  part({
    partId: 'weapon-dagger',
    slotKind: 'weapon',
    displayName: 'Dagger',
    weaponKind: 'dagger',
    weaponPower: 2,
    soundTags: ['weapon.dagger'],
    mediaKey: 'parts/weapon-dagger',
  }),
  part({
    partId: 'shield-proto',
    slotKind: 'shield',
    displayName: 'Proto Shield',
    weaponKind: null,
    weaponPower: null,
    soundTags: ['shield.metal'],
    mediaKey: 'parts/shield-proto',
  }),
  ...(
    [
      ['head-visor', 'head'],
      ['head-welder', 'head'],
      ['head-can', 'head'],
      ['body-chassis', 'body'],
      ['body-boiler', 'body'],
      ['body-slab', 'body'],
      ['arms-stock', 'arms'],
      ['arms-heavy', 'arms'],
      ['legs-stock', 'legs'],
      ['legs-piston', 'legs'],
    ] as const
  ).map(([partId, slotKind]) =>
    part({
      partId,
      slotKind,
      displayName: partId,
      weaponKind: null,
      weaponPower: null,
      soundTags: [],
      mediaKey: `parts/${partId}`,
    }),
  ),
];

const STOCK_SHAPES = {
  head: 'head-visor',
  body: 'body-chassis',
  arms: 'arms-stock',
  legs: 'legs-stock',
} as const;

const catalogue = new Map(PROOF.map((p) => [p.partId, p]));
const owned = new Set(PROOF.map((p) => p.partId));

describe('validateBotLoadout', () => {
  it('accepts the proof loadout and derives sound tags', () => {
    const result = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
      },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loadout).toEqual({
      chassis: 'chassis-basic',
      paint: 'paint-crimson',
      weapon: 'weapon-sword',
      shield: null,
      drone: null,
      decals: [],
      soundTags: ['chassis.light', 'weapon.sword'],
      ...STOCK_SHAPES,
    } satisfies BotLoadout);
  });

  it('defaults missing or null shape slots to stock (pre-A4 loadouts)', () => {
    const result = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        head: null,
        legs: '',
      },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loadout).toMatchObject(STOCK_SHAPES);
    expect(STOCK_SHAPE_PART_IDS).toEqual(STOCK_SHAPES);
  });

  it('keeps chosen shapes, does not touch chassis, and leaves sound tags alone', () => {
    const result = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        head: 'head-welder',
        body: 'body-boiler',
        arms: 'arms-heavy',
        legs: 'legs-piston',
      },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loadout).toMatchObject({
      chassis: 'chassis-basic',
      head: 'head-welder',
      body: 'body-boiler',
      arms: 'arms-heavy',
      legs: 'legs-piston',
      soundTags: ['chassis.light', 'weapon.sword'],
    });
  });

  it('rejects shape slot mismatches, unowned shapes, and non-string shapes', () => {
    const mismatch = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        body: 'head-can',
      },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.errors.map((e) => e.code)).toContain('slot_mismatch');

    const unowned = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        legs: 'legs-piston',
      },
      catalogue,
      ownedPartIds: new Set([...owned].filter((id) => id !== 'legs-piston')),
      requireOwnership: true,
    });
    expect(unowned.ok).toBe(false);
    if (!unowned.ok) expect(unowned.errors.map((e) => e.code)).toContain('unowned_part');

    const badType = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        arms: 7,
      },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(badType.ok).toBe(false);
    if (!badType.ok) expect(badType.errors.map((e) => e.code)).toContain('invalid_loadout');
  });

  it('rejects missing required slots', () => {
    const result = validateBotLoadout({
      loadout: { chassis: 'chassis-basic' },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.code === 'missing_slot')).toBe(true);
  });

  it('rejects unowned parts for players', () => {
    const result = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-axe',
      },
      catalogue,
      ownedPartIds: new Set(['chassis-basic', 'paint-crimson', 'weapon-sword']),
      requireOwnership: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toContain('unowned_part');
  });

  it('allows opponents to equip catalogue parts without ownership', () => {
    const result = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-cobalt',
        weapon: 'weapon-dagger',
      },
      catalogue,
      ownedPartIds: new Set(),
      requireOwnership: false,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects slot mismatches', () => {
    const result = validateBotLoadout({
      loadout: {
        chassis: 'weapon-sword',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
      },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toContain('slot_mismatch');
  });

  it('accepts reserved extension shield when owned', () => {
    const result = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        shield: 'shield-proto',
      },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.loadout.shield).toBe('shield-proto');
    expect(result.loadout.soundTags).toContain('shield.metal');
  });

  it('rejects more than MAX_DECALS', () => {
    const result = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        decals: Array.from({ length: MAX_DECALS + 1 }, (_, i) => `decal-${i}`),
      },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toContain('too_many_decals');
  });

  it('rejects invalid atlas versions', () => {
    const result = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
      },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
      atlasVersion: '1',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code)).toContain('invalid_atlas_version');
  });

  it('rejects non-object loadouts and bad optional fields', () => {
    expect(
      validateBotLoadout({
        loadout: null,
        catalogue,
        ownedPartIds: owned,
        requireOwnership: true,
      }).ok,
    ).toBe(false);

    const badShield = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        shield: 12,
      },
      catalogue,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(badShield.ok).toBe(false);

    const inactive = new Map(catalogue);
    inactive.set('chassis-basic', { ...catalogue.get('chassis-basic')!, isActive: false });
    const inactiveResult = validateBotLoadout({
      loadout: {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
      },
      catalogue: inactive,
      ownedPartIds: owned,
      requireOwnership: true,
    });
    expect(inactiveResult.ok).toBe(false);
    if (!inactiveResult.ok) {
      expect(inactiveResult.errors.map((e) => e.code)).toContain('inactive_part');
    }
  });
});

describe('loadoutWeaponFromCatalogue', () => {
  it('maps weapon part to combat-v1 fields', () => {
    const loadout: BotLoadout = {
      chassis: 'chassis-basic',
      paint: 'paint-crimson',
      weapon: 'weapon-axe',
      shield: null,
      drone: null,
      decals: [],
      soundTags: [],
      ...STOCK_SHAPES,
    };
    expect(loadoutWeaponFromCatalogue(loadout, catalogue)).toEqual({
      kind: 'axe',
      power: 5,
    });
  });
});

describe('fighterSnapshotFromBuildAndLoadout', () => {
  it('assembles combat-v1 snapshot from build stats + loadout weapon', () => {
    const loadout: BotLoadout = {
      chassis: 'chassis-basic',
      paint: 'paint-crimson',
      weapon: 'weapon-sword',
      shield: null,
      drone: null,
      decals: [],
      soundTags: ['chassis.light', 'weapon.sword'],
      ...STOCK_SHAPES,
    };
    expect(
      fighterSnapshotFromBuildAndLoadout(
        {
          characterId: 'player-hero',
          displayName: 'Hero',
          hp: 30,
          strength: 5,
          agility: 5,
          speed: 6,
        },
        loadout,
        catalogue,
      ),
    ).toEqual({
      characterId: 'player-hero',
      displayName: 'Hero',
      hp: 30,
      strength: 5,
      agility: 5,
      speed: 6,
      weaponKind: 'sword',
      weaponPower: 3,
    });
  });
});
