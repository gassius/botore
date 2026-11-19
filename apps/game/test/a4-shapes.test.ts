/**
 * A4 shapes v2.1 ShapeKit: padded tiles keep v003.3 world attachments, swap
 * media paths, and resolve every emitted path for Metro.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import shapesJson from '../assets/a4-shapes-v2.1/shapes.json';
import { assembleBot, withPaint } from '../src/assembler/assemble';
import {
  HEAVIEST_SHAPES,
  SHAPE_OPTIONS,
  SHAPE_SLOTS,
  SHAPE_VARIANT_FOLDERS,
  STOCK_SHAPES,
  shapeAlias,
  shapeComboFromLoadout,
  shapePartId,
  type ShapeCombo,
} from '../src/assembler/shapes';
import {
  WORKSHOP_FRAME_MANIFEST,
  assembleWorkshopFrame,
} from '../src/assembler/workshopFrameAdapter';
import type { AssembledBot, MotionPose } from '../src/assembler/types';

const ASSETS_DIR = join(__dirname, '../assets');
const base = { chassis: 'chassis-basic', paint: 'paint-crimson', weapon: 'weapon-sword' };

function assemble(shapes: ShapeCombo, motionPose: MotionPose = 'idle', weapon = 'weapon-sword') {
  return assembleWorkshopFrame({
    loadout: { ...base, weapon, ...shapes },
    facing: 'right',
    motionPose,
  });
}

function layer(bot: AssembledBot, id: string) {
  const found = bot.layers.find((l) => l.id === id);
  if (!found) throw new Error(`missing layer ${id}`);
  return found;
}

describe('A4 shape catalogue resolution', () => {
  it('lists stock first in every slot and maps aliases ↔ catalogue ids', () => {
    for (const slot of SHAPE_SLOTS) {
      expect(SHAPE_OPTIONS[slot][0].alias).toBe(STOCK_SHAPES[slot]);
    }
    expect(shapePartId('body', 'boiler')).toBe('body-boiler');
    expect(shapeAlias('legs', 'legs-piston')).toBe('piston');
    expect(shapeAlias('head', 'not-a-head')).toBe('visor');
  });

  it('reads pre-A4 loadouts (no shape fields) as the stock combo', () => {
    expect(assembleBot({ loadout: base, facing: 'right' }).shapes).toEqual(STOCK_SHAPES);
    expect(shapeComboFromLoadout({ head: null, body: '', arms: undefined })).toEqual(STOCK_SHAPES);
  });

  it('heaviest combo matches the art pack', () => {
    const heaviest = (shapesJson as { heaviest: Record<string, string> }).heaviest;
    expect(HEAVIEST_SHAPES).toEqual({
      head: heaviest.head,
      body: heaviest.chest,
      arms: heaviest.arms,
      legs: heaviest.legs,
    });
  });
});

describe('ShapeKit assembly', () => {
  it('stock combo assembles exactly like the kit without shapes', () => {
    const plain = assembleWorkshopFrame({ loadout: base, facing: 'right' });
    expect(assemble(STOCK_SHAPES).layers).toEqual(plain.layers);
    expect(plain.shapes).toEqual(STOCK_SHAPES);
    expect(plain.layers.some((l) => l.materialUnderPath?.startsWith('a4-shapes'))).toBe(false);
  });

  it('heaviest combo swaps variant tiles (L/R limbs share one tile) and keeps the rest on kit', () => {
    const bot = assemble(HEAVIEST_SHAPES);
    const expectFolder = (id: string, folder: string) => {
      const l = layer(bot, id);
      expect(l.materialUnderPath).toBe(`a4-shapes-v2.1/parts/1x/${folder}/under.png`);
      expect(l.materialOverPath).toBe(`a4-shapes-v2.1/parts/1x/${folder}/over.png`);
      expect(l.paintMaskPath).toBe(`a4-shapes-v2.1/parts/1x/${folder}/mask.png`);
      expect(l.imagePath).toBe(`a4-shapes-v2.1/parts/1x/${folder}/oxide.png`);
    };
    expectFolder('head', 'head-welder');
    expectFolder('torso', 'torso-boiler');
    for (const side of ['l', 'r']) {
      expectFolder(`upper_arm_${side}`, 'upper_arm-heavy');
      expectFolder(`forearm_${side}`, 'forearm-heavy');
      expectFolder(`thigh_${side}`, 'thigh-piston');
      expectFolder(`shin_${side}`, 'shin-piston');
      expectFolder(`foot_${side}`, 'foot-piston');
    }
    for (const id of ['pelvis', 'hand_l', 'hand_r', 'weapon_sword']) {
      expect(layer(bot, id).materialUnderPath).not.toMatch(/a4-shapes/);
    }
    expect(layer(bot, 'torso')).toMatchObject({
      width: 292,
      height: 234,
      pivotX: 150,
      pivotY: 176,
    });
    expect(layer(bot, 'thigh_l')).toMatchObject({ width: 164, height: 150, pivotX: 82 });
    expect(layer(bot, 'shin_r')).toMatchObject({ width: 160, height: 150, pivotX: 80 });
    expect(layer(bot, 'foot_l')).toMatchObject({ width: 194, height: 100, pivotX: 80 });
    expect(layer(bot, 'head')).toMatchObject({ width: 210, height: 180 });
  });

  it('padded tiles keep every world attachment identical to stock across poses and weapons', () => {
    const poses = Object.keys(WORKSHOP_FRAME_MANIFEST.poses).filter((p): p is MotionPose =>
      ['idle', 'attack', 'dodge', 'hit', 'defeat', 'victory', 'knockout', 'walk_in'].includes(p),
    );
    expect(poses.length).toBeGreaterThan(3);
    const combos: ShapeCombo[] = [
      HEAVIEST_SHAPES,
      { head: 'can', body: 'slab', arms: 'stock', legs: 'piston' },
    ];
    for (const weapon of ['weapon-sword', 'weapon-axe']) {
      for (const pose of poses) {
        const stock = assemble(STOCK_SHAPES, pose, weapon);
        for (const combo of combos) {
          const shaped = assemble(combo, pose, weapon);
          expect(shaped.grip.x).toBeCloseTo(stock.grip.x, 6);
          expect(shaped.grip.y).toBeCloseTo(stock.grip.y, 6);
          for (const s of stock.layers) {
            const v = layer(shaped, s.id);
            expect(v.worldPivotX, `${pose} ${s.id}`).toBeCloseTo(s.worldPivotX!, 6);
            expect(v.worldPivotY, `${pose} ${s.id}`).toBeCloseTo(s.worldPivotY!, 6);
            expect(v.rotateCwDeg).toBeCloseTo(s.rotateCwDeg!, 6);
            expect(v.zIndex).toBe(s.zIndex);
          }
        }
      }
    }
  });

  it('pattern paints fall back to mask tint on swapped tiles only', () => {
    const bot = assembleWorkshopFrame({
      loadout: { ...base, paint: 'paint-hazard', ...HEAVIEST_SHAPES, head: 'visor' },
      facing: 'right',
    });
    expect(layer(bot, 'torso').patternFillPath).toBeUndefined();
    expect(layer(bot, 'torso').paintMaskPath).toBe('a4-shapes-v2.1/parts/1x/torso-boiler/mask.png');
    expect(layer(bot, 'head').patternFillPath).toBe('a6-paints-v4/pattern-fills/hazard/head.png');
  });

  it('withPaint keeps the bot shapes', () => {
    const bot = assembleBot({ loadout: { ...base, ...HEAVIEST_SHAPES }, facing: 'right' });
    expect(withPaint(bot, 'petrol').shapes).toEqual(HEAVIEST_SHAPES);
  });
});

describe('A4 shape media for Metro', () => {
  it('ships 9 variant folders, each registered for Metro and present on disk', () => {
    const assetMapSource = readFileSync(
      join(__dirname, '../src/assembler/workshopFrameAssets.ts'),
      'utf8',
    );
    expect([...SHAPE_VARIANT_FOLDERS].sort()).toEqual([
      'foot-piston',
      'forearm-heavy',
      'head-can',
      'head-welder',
      'shin-piston',
      'thigh-piston',
      'torso-boiler',
      'torso-slab',
      'upper_arm-heavy',
    ]);
    const combos: ShapeCombo[] = [
      HEAVIEST_SHAPES,
      { head: 'can', body: 'slab', arms: 'stock', legs: 'stock' },
    ];
    const paths = new Set<string>();
    for (const combo of combos) {
      for (const l of assemble(combo).layers) {
        for (const p of [l.imagePath, l.materialUnderPath, l.materialOverPath, l.paintMaskPath]) {
          if (p?.startsWith('a4-shapes')) paths.add(p);
        }
      }
    }
    expect(paths.size).toBe(9 * 4);
    for (const p of paths) {
      expect(assetMapSource, p).toContain(`'${p}':\n    require('../../assets/${p}')`);
      expect(existsSync(join(ASSETS_DIR, p)), p).toBe(true);
    }
  });
});
