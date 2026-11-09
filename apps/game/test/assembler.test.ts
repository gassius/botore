import { describe, it, expect } from 'vitest';
import {
  assembleBot,
  withFacing,
  withPaint,
  withWeapon,
  provisionalMotionOffset,
} from '../src/assembler/assemble';
import { OXIDE_PAINT, PETROL_PAINT, resolvePaintVisual } from '../src/assembler/paints';
import { PLACEHOLDER_GRIP, resolveWeaponKit } from '../src/assembler/kit';
import {
  ACTIVE_WORKSHOP_FRAME_FAMILY,
  MOTION_POSE_TO_KIT,
  WORKSHOP_FRAME_KIT_ID,
  WORKSHOP_FRAME_MANIFEST,
  assembleWorkshopFrame,
  buildWorkshopFrameWorldMatrices,
  listWorkshopFrameGaps,
} from '../src/assembler/workshopFrameAdapter';
import { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION } from '../src/assembler/workshopFramePin';
import {
  applyCenterOriginScaleX,
  childLocalMatrix,
  decomposeTranslateRotate,
  rotateCwDeg,
  transformPoint,
} from '../src/assembler/kitMath';
import v001ManifestJson from '../assets/workshop-frame-kit-v001/manifest.json';

const baseLoadout = {
  chassis: 'chassis-basic',
  paint: 'paint-crimson',
  weapon: 'weapon-sword',
};

const v001Manifest = v001ManifestJson as {
  version: string;
  assets: Array<{
    id: string;
    width: number;
    pivot: number[];
    sockets: Record<string, number[]>;
    compatible_family: string;
  }>;
};

describe('BotAssembler PLACEHOLDER path', () => {
  it('assembles geometric PLACEHOLDER layers with paint mask + weapon grip', () => {
    const bot = assembleBot({ loadout: baseLoadout, facing: 'right', placeholder: true });
    expect(bot.placeholder).toBe(true);
    expect(bot.canvas.provisional).toBe(true);
    expect(bot.grip).toEqual(PLACEHOLDER_GRIP);
    expect(bot.paintVisual).toBe('oxide');
    expect(bot.weaponKind).toBe('sword');
    expect(bot.layers.some((l) => l.isPaintMask)).toBe(true);
    expect(bot.layers.find((l) => l.role === 'weapon')?.attachTo).toBe('hand');
  });

  it('marks motion offsets PROVISIONAL and zeros them under reducedMotion', () => {
    const attack = provisionalMotionOffset('attack', false);
    expect(attack.provisional).toBe(true);
    expect(attack.translateX).not.toBe(0);
    const reduced = provisionalMotionOffset('attack', true);
    expect(reduced.translateX).toBe(0);
  });
});

describe('Workshop Frame kit-v002 adapter (ACTIVE pin)', () => {
  it('pins coherent v002 manifest + family; never claims v001 geometry', () => {
    expect(ACTIVE_WORKSHOP_FRAME_ASSET_VERSION).toBe('v002');
    expect(WORKSHOP_FRAME_MANIFEST.version).toBe('v002');
    expect(WORKSHOP_FRAME_KIT_ID).toBe('workshop-frame-v002');
    expect(ACTIVE_WORKSHOP_FRAME_FAMILY).toBe('workshop-frame-v002');
    const torso = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'torso')!;
    expect(torso.compatible_family).toBe('workshop-frame-v002');
    // Exact v002 measured values from INTEGRATION-DELTA (not v001).
    expect(torso.width).toBe(228);
    expect(torso.height).toBe(196);
    expect(torso.pivot).toEqual([118, 146]);
    expect(torso.sockets.shoulder_r![0]).toBe(194.88);
    const hand = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'hand_r')!;
    expect(hand.sockets.grip).toEqual([60.0, 61.6]);
    const sword = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'weapon_sword')!;
    expect(sword.height).toBe(208);
    expect(sword.pivot).toEqual([60, 163]);
    expect(WORKSHOP_FRAME_MANIFEST.poses.heavy_windup?.root_y).toBe(45);
  });

  it('keeps v001 immutable on disk and proves coordinates differ (must_not_mix)', () => {
    expect(v001Manifest.version).toBe('v001');
    const v001Torso = v001Manifest.assets.find((a) => a.id === 'torso')!;
    expect(v001Torso.compatible_family).toBe('workshop-frame-v001');
    expect(v001Torso.pivot).toEqual([110, 130]);
    expect(v001Torso.width).toBe(220);
    const v002Torso = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'torso')!;
    expect(v002Torso.pivot).not.toEqual(v001Torso.pivot);
    expect(v002Torso.width).not.toBe(v001Torso.width);
    // Active assembly layers must report v002 kit id only.
    const bot = assembleWorkshopFrame({ loadout: baseLoadout, facing: 'right' });
    expect(bot.kitId).toBe('workshop-frame-v002');
    expect(bot.layers.every((l) => l.label?.startsWith('workshop-frame-v002:'))).toBe(true);
    expect(bot.layers.find((l) => l.id === 'torso')?.width).toBe(228);
    expect(bot.layers.find((l) => l.id === 'torso')?.pivotX).toBe(118);
    expect(bot.layers.find((l) => l.id === 'torso')?.pivotY).toBe(146);
  });

  it('maps catalogue / alias paints onto Oxide and Petrol without catalogue expansion', () => {
    expect(resolvePaintVisual('oxide').cataloguePaintId).toBe('paint-crimson');
    expect(resolvePaintVisual('petrol').cataloguePaintId).toBe('paint-cobalt');
    expect(OXIDE_PAINT.armourColor).toBe(WORKSHOP_FRAME_MANIFEST.paint_tokens.oxide);
    expect(PETROL_PAINT.armourColor).toBe(WORKSHOP_FRAME_MANIFEST.paint_tokens.petrol);
    expect(OXIDE_PAINT.armourColor).not.toBe(PETROL_PAINT.armourColor);
  });

  it('assembles 15 robot parts + weapon from measured pivots with shared grip rotation', () => {
    const bot = assembleWorkshopFrame({ loadout: baseLoadout, facing: 'right' });
    expect(bot.placeholder).toBe(false);
    expect(bot.kitId).toBe(WORKSHOP_FRAME_KIT_ID);
    expect(bot.canvas.width).toBe(640);
    expect(bot.layers.length).toBe(16); // 15 body + weapon
    expect(bot.layers.every((l) => typeof l.imagePath === 'string')).toBe(true);
    expect(bot.layers.find((l) => l.id === 'weapon_sword')).toBeTruthy();
    expect(bot.layers.map((l) => l.zIndex)).toEqual(
      [...bot.layers]
        .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))
        .map((l) => l.zIndex),
    );

    const { matrices } = buildWorkshopFrameWorldMatrices('oxide', 'weapon-sword', 'idle');
    const hand = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'hand_r')!;
    const weapon = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'weapon_sword')!;
    const handM = matrices.get('hand_r')!;
    const weaponM = matrices.get('weapon_sword')!;
    const grip = hand.sockets.grip!;
    const gripWorld = transformPoint(handM, grip[0], grip[1]);
    const weaponPivotWorld = transformPoint(weaponM, weapon.pivot[0], weapon.pivot[1]);
    expect(Math.abs(gripWorld.x - weaponPivotWorld.x)).toBeLessThan(1e-6);
    expect(Math.abs(gripWorld.y - weaponPivotWorld.y)).toBeLessThan(1e-6);
    expect(WORKSHOP_FRAME_MANIFEST.weapon_grip_rotation_degrees).toBe(180);
  });

  it('swaps Oxide/Petrol and sword/axe/dagger via existing BotAssembler props', () => {
    const oxideSword = assembleBot({ loadout: baseLoadout, facing: 'right', placeholder: false });
    const petrol = withPaint(oxideSword, 'petrol');
    const axe = withWeapon(oxideSword, 'weapon-axe');
    const dagger = withWeapon(oxideSword, 'dagger');

    expect(oxideSword.paintVisual).toBe('oxide');
    expect(petrol.paintVisual).toBe('petrol');
    expect(oxideSword.layers.find((l) => l.id === 'torso')?.imagePath).toBe(
      'parts/torso-oxide.png',
    );
    expect(petrol.layers.find((l) => l.id === 'torso')?.imagePath).toBe('parts/torso-petrol.png');

    expect(axe.weaponKind).toBe('axe');
    expect(dagger.weaponKind).toBe('dagger');
    expect(axe.layers.some((l) => l.id === 'weapon_axe')).toBe(true);
    expect(dagger.layers.some((l) => l.id === 'weapon_dagger')).toBe(true);
    expect(resolveWeaponKit('weapon-axe').catalogueId).toBe('weapon-axe');
  });

  it('mirrors opponent facing without changing part ids; maps attack→quick_attack', () => {
    const player = assembleBot({ loadout: baseLoadout, facing: 'right', placeholder: false });
    const opponent = withFacing(player, 'left');
    expect(player.mirrored).toBe(false);
    expect(opponent.mirrored).toBe(true);
    expect(opponent.paintId).toBe(player.paintId);
    expect(opponent.weaponId).toBe(player.weaponId);
    expect(opponent.layers.map((l) => l.id).sort()).toEqual(player.layers.map((l) => l.id).sort());

    const attacking = assembleBot({
      loadout: baseLoadout,
      facing: 'right',
      motionPose: 'attack',
      placeholder: false,
    });
    expect(MOTION_POSE_TO_KIT.attack).toBe('quick_attack');
    expect(attacking.kitPoseKey).toBe('quick_attack');
    expect(attacking.layers.find((l) => l.id === 'torso')?.rotateCwDeg).not.toBe(
      player.layers.find((l) => l.id === 'torso')?.rotateCwDeg,
    );
  });

  it('RN centre-origin scaleX(-1) mirrors canvas endpoints about mid-X (no double pivot)', () => {
    // Shipped proof/replay opponent box is often 170dp; kit canvas is 640.
    for (const width of [170, WORKSHOP_FRAME_MANIFEST.canvas[0]]) {
      const mid = width / 2;
      expect(applyCenterOriginScaleX(0, width, -1)).toBeCloseTo(width, 10);
      expect(applyCenterOriginScaleX(width, width, -1)).toBeCloseTo(0, 10);
      expect(applyCenterOriginScaleX(mid, width, -1)).toBeCloseTo(mid, 10);
      expect(applyCenterOriginScaleX(mid / 2, width, -1)).toBeCloseTo(width - mid / 2, 10);
      // Broken sandwich translate(w/2)·scaleX(-1)·translate(-w/2) on top of centre origin:
      // effective x' = 2w - x (shifts centre by +w). Must not be what we use.
      const brokenDoublePivot = (x: number) => 2 * width - x;
      expect(applyCenterOriginScaleX(mid, width, -1)).not.toBeCloseTo(
        brokenDoublePivot(mid),
        5,
      );
    }
    expect(WORKSHOP_FRAME_MANIFEST.mirror).toMatch(/x_new=640-x|x=320/);
  });

  it('uses +Y-down clockwise rotation: +90° sends +X to +Y; idle upper_arm_r elbow matches v002', () => {
    expect(transformPoint(rotateCwDeg(90), 1, 0)).toEqual({
      x: expect.closeTo(0, 10),
      y: expect.closeTo(1, 10),
    });
    expect(transformPoint(rotateCwDeg(90), 0, 1)).toEqual({
      x: expect.closeTo(-1, 10),
      y: expect.closeTo(0, 10),
    });
    expect(decomposeTranslateRotate(rotateCwDeg(-24)).rotateCwDeg).toBeCloseTo(-24, 10);
    expect(decomposeTranslateRotate(rotateCwDeg(45)).rotateCwDeg).toBeCloseTo(45, 10);

    const arm = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'upper_arm_r')!;
    expect(arm.angle).toBe(-24);
    const elbow = arm.sockets.elbow!;
    const local = childLocalMatrix(0, 0, arm.angle, arm.pivot[0], arm.pivot[1]);
    const elbowRel = transformPoint(local, elbow[0], elbow[1]);
    // Contract: relative to shoulder/pivot after CW -24°, elbow ≈ (+25.413, +57.078), not mirrored X.
    expect(elbowRel.x).toBeCloseTo(25.413, 2);
    expect(elbowRel.y).toBeCloseTo(57.078, 2);
    expect(elbowRel.x).toBeGreaterThan(0);

    const { matrices } = buildWorkshopFrameWorldMatrices('oxide', 'weapon-sword', 'idle');
    const torso = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'torso')!;
    const shoulder = torso.sockets.shoulder_r!;
    const armM = matrices.get('upper_arm_r')!;
    const elbowWorld = transformPoint(armM, elbow[0], elbow[1]);
    const torsoM = matrices.get('torso')!;
    const shoulderWorld = transformPoint(torsoM, shoulder[0], shoulder[1]);
    expect(elbowWorld.x - shoulderWorld.x).toBeCloseTo(25.413, 2);
    expect(elbowWorld.y - shoulderWorld.y).toBeCloseTo(57.078, 2);
  });

  it('honours paintId / weaponId overrides for preview without mutating input loadout', () => {
    const bot = assembleBot({
      loadout: baseLoadout,
      facing: 'right',
      paintId: 'petrol',
      weaponId: 'axe',
      placeholder: false,
    });
    expect(bot.paintVisual).toBe('petrol');
    expect(bot.weaponKind).toBe('axe');
    expect(baseLoadout.paint).toBe('paint-crimson');
    expect(baseLoadout.weapon).toBe('weapon-sword');
  });

  it('records concrete Game Art adapter gaps including v002 no-mix rule', () => {
    const gaps = listWorkshopFrameGaps();
    expect(gaps.length).toBeGreaterThan(5);
    expect(gaps.some((g) => g.includes('must_not_mix_versions') || g.includes('v002'))).toBe(true);
    expect(gaps.some((g) => g.includes('heavy_'))).toBe(true);
    expect(gaps.some((g) => g.includes('weapon_sword'))).toBe(true);
  });
});
