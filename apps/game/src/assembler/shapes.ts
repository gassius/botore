/**
 * A4 ShapeKit: alternate Workshop Frame tiles (assets/a4-shapes-v2.1) applied
 * over kit-v003.3 at assemble time. The kit manifest is never rewritten.
 *
 * Chests and piston legs ship on a padded canvas; their pivot and socket
 * numbers are shifted by the same padding, so world-space attachments match
 * stock exactly. Heads and heavy arms keep the stock canvas.
 */
import shapesJson from '../../assets/a4-shapes-v2.1/shapes.json';
import type { KitAsset } from './workshopFrameTypes';

export const SHAPE_SLOTS = ['head', 'body', 'arms', 'legs'] as const;
export type ShapeSlot = (typeof SHAPE_SLOTS)[number];

/** Per slot, stock first. `partId` is the parts_catalogue id; `alias` is the UI / art id. */
export const SHAPE_OPTIONS = {
  head: [
    { alias: 'visor', partId: 'head-visor', label: 'Visor' },
    { alias: 'welder', partId: 'head-welder', label: 'Welder' },
    { alias: 'can', partId: 'head-can', label: 'Can' },
  ],
  body: [
    { alias: 'chassis', partId: 'body-chassis', label: 'Chassis' },
    { alias: 'boiler', partId: 'body-boiler', label: 'Boiler' },
    { alias: 'slab', partId: 'body-slab', label: 'Slab' },
  ],
  arms: [
    { alias: 'stock', partId: 'arms-stock', label: 'Stock' },
    { alias: 'heavy', partId: 'arms-heavy', label: 'Heavy' },
  ],
  legs: [
    { alias: 'stock', partId: 'legs-stock', label: 'Stock' },
    { alias: 'piston', partId: 'legs-piston', label: 'Piston' },
  ],
} as const;

export type ShapeAlias<S extends ShapeSlot> = (typeof SHAPE_OPTIONS)[S][number]['alias'];
export type ShapeCombo = { readonly [S in ShapeSlot]: ShapeAlias<S> };

export const STOCK_SHAPES: ShapeCombo = {
  head: 'visor',
  body: 'chassis',
  arms: 'stock',
  legs: 'stock',
};

export const HEAVIEST_SHAPES: ShapeCombo = {
  head: 'welder',
  body: 'boiler',
  arms: 'heavy',
  legs: 'piston',
};

/** Metro / atlas-relative root for the 1x A4 tiles. */
export const A4_SHAPES_PARTS_DIR = 'a4-shapes-v2.1/parts/1x';

/** Resolve a catalogue id or alias to the slot alias; unknown / missing → stock. */
export function shapeAlias<S extends ShapeSlot>(
  slot: S,
  idOrAlias: string | null | undefined,
): ShapeAlias<S> {
  const options: readonly { alias: ShapeAlias<S>; partId: string }[] = SHAPE_OPTIONS[slot];
  const id = (idOrAlias ?? '').trim().toLowerCase();
  return (options.find((o) => o.partId === id || o.alias === id) ?? options[0]!).alias;
}

export function shapePartId<S extends ShapeSlot>(slot: S, idOrAlias: string): string {
  const alias = shapeAlias(slot, idOrAlias);
  const options: readonly { alias: string; partId: string }[] = SHAPE_OPTIONS[slot];
  return options.find((o) => o.alias === alias)!.partId;
}

export function shapeComboFromLoadout(loadout: {
  readonly [S in ShapeSlot]?: string | null | undefined;
}): ShapeCombo {
  return {
    head: shapeAlias('head', loadout.head),
    body: shapeAlias('body', loadout.body),
    arms: shapeAlias('arms', loadout.arms),
    legs: shapeAlias('legs', loadout.legs),
  };
}

export function shapeComboKey(combo: ShapeCombo): string {
  return SHAPE_SLOTS.map((slot) => combo[slot]).join('.');
}

/** Kit tile kinds the A4 pack replaces. L/R limbs share one tile, as the kit does. */
const SHAPE_TILES = ['head', 'torso', 'upper_arm', 'forearm', 'thigh', 'shin', 'foot'] as const;
type ShapeTile = (typeof SHAPE_TILES)[number];

type Vec2 = readonly [number, number];

interface TileGeom {
  readonly canvas?: Vec2;
  readonly pivot?: Vec2;
  readonly sockets?: Readonly<Record<string, Vec2>>;
}

interface TileOverride {
  /** Folder under A4_SHAPES_PARTS_DIR, e.g. `torso-boiler`. */
  readonly folder: string;
  readonly geom: TileGeom;
}

interface ShapesJsonVariant extends TileGeom {
  readonly id: string;
  readonly parts?: Readonly<Record<string, string>>;
  readonly geom?: Readonly<Record<string, TileGeom>>;
}

const SHAPES_JSON = shapesJson as unknown as Readonly<
  Record<'heads' | 'chests' | 'arms' | 'legs', readonly ShapesJsonVariant[]>
>;

const JSON_GROUP: Readonly<Record<ShapeSlot, keyof typeof SHAPES_JSON>> = {
  head: 'heads',
  body: 'chests',
  arms: 'arms',
  legs: 'legs',
};

type VariantTiles = ReadonlyMap<ShapeTile, TileOverride>;

/** alias → tile overrides for one slot, read from shapes.json. Stock variants are empty. */
function readTileOverrides(slot: ShapeSlot): ReadonlyMap<string, VariantTiles> {
  return new Map(
    SHAPES_JSON[JSON_GROUP[slot]].map((variant) => {
      const tiles = new Map<ShapeTile, TileOverride>();
      for (const [tile, name] of Object.entries(variant.parts ?? {})) {
        tiles.set(tile as ShapeTile, {
          folder: `${tile}-${name}`,
          geom: variant.geom?.[tile] ?? variant,
        });
      }
      return [variant.id, tiles];
    }),
  );
}

const TILE_OVERRIDES: Readonly<Record<ShapeSlot, ReadonlyMap<string, VariantTiles>>> = {
  head: readTileOverrides('head'),
  body: readTileOverrides('body'),
  arms: readTileOverrides('arms'),
  legs: readTileOverrides('legs'),
};

/** Every variant tile folder shipped by the pack (9 for v2.1). */
export const SHAPE_VARIANT_FOLDERS: readonly string[] = SHAPE_SLOTS.flatMap((slot) =>
  [...TILE_OVERRIDES[slot].values()].flatMap((tiles) => [...tiles.values()].map((t) => t.folder)),
);

/** Kit asset with A4 tile paths / geometry applied. `shapeVariant` marks a swapped tile. */
export interface ShapedKitAsset extends KitAsset {
  readonly shapeVariant?: string;
}

function tileForKitAsset(assetId: string): ShapeTile | null {
  const base = assetId.replace(/_[lr]$/, '');
  return (SHAPE_TILES as readonly string[]).includes(base) ? (base as ShapeTile) : null;
}

function shapedAsset(asset: KitAsset, { folder, geom }: TileOverride): ShapedKitAsset {
  const dir = `${A4_SHAPES_PARTS_DIR}/${folder}`;
  return {
    ...asset,
    width: geom.canvas?.[0] ?? asset.width,
    height: geom.canvas?.[1] ?? asset.height,
    pivot: geom.pivot ?? asset.pivot,
    sockets: { ...asset.sockets, ...geom.sockets },
    files: { oxide: `${dir}/oxide.png` },
    material_under: `${dir}/under.png`,
    material_over: `${dir}/over.png`,
    paint_mask: `${dir}/mask.png`,
    shapeVariant: folder,
  };
}

/** Kit assets by id with the combo's A4 tiles swapped in. Stock combo returns kit assets as-is. */
export function applyShapeKit(
  assets: readonly KitAsset[],
  combo: ShapeCombo,
): ReadonlyMap<string, ShapedKitAsset> {
  const overrides = new Map<ShapeTile, TileOverride>();
  for (const slot of SHAPE_SLOTS) {
    for (const [tile, override] of TILE_OVERRIDES[slot].get(combo[slot]) ?? []) {
      overrides.set(tile, override);
    }
  }
  return new Map(
    assets.map((asset) => {
      const tile = tileForKitAsset(asset.id);
      const override = tile ? overrides.get(tile) : undefined;
      return [asset.id, override ? shapedAsset(asset, override) : asset];
    }),
  );
}
