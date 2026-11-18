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
  resolveWorkshopFramePose,
} from '../src/assembler/workshopFrameAdapter';
import { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION } from '../src/assembler/workshopFramePin';
import {
  applyCenterOriginScaleX,
  childLocalMatrix,
  decomposeTranslateRotate,
  rotateCwDeg,
  transformPoint,
} from '../src/assembler/kitMath';
import integrationDeltaJson from '../assets/workshop-frame-kit-v003/integration-delta-v002-to-v003.json';

const baseLoadout = {
  chassis: 'chassis-basic',
  paint: 'paint-crimson',
  weapon: 'weapon-sword',
};

const integrationDelta = integrationDeltaJson as {
  from: { version: string; family: string };
  to: { version: string; family: string };
};

/** Historical v002 torso metrics (v002 kept as history; active pin is v003). */
const V002_TORSO_FROM_HISTORY = {
  compatible_family: 'workshop-frame-v002',
  width: 228,
  pivot: [118, 146] as const,
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

describe('Workshop Frame kit-v003.3 adapter (ACTIVE pin)', () => {
  it('pins coherent v003.3 manifest + family; never claims v002 geometry as active', () => {
    expect(ACTIVE_WORKSHOP_FRAME_ASSET_VERSION).toBe('v003.3');
    expect(WORKSHOP_FRAME_MANIFEST.version).toBe('v003.3');
    expect(WORKSHOP_FRAME_KIT_ID).toBe('workshop-frame-v003.3');
    expect(ACTIVE_WORKSHOP_FRAME_FAMILY).toBe('workshop-frame-v003');
    expect(WORKSHOP_FRAME_MANIFEST.family).toBe('workshop-frame-v003');
    expect(WORKSHOP_FRAME_MANIFEST.stage?.size).toEqual([800, 800]);
    expect(WORKSHOP_FRAME_MANIFEST.stage?.rig_origin).toEqual([80, 160]);
    const torso = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'torso')!;
    expect(torso.compatible_family).toBe('workshop-frame-v003');
    // Body geometry matches v002 for torso; hands/weapons changed in v003.
    expect(torso.width).toBe(228);
    expect(torso.height).toBe(196);
    expect(torso.pivot).toEqual([118, 146]);
    const hand = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'hand_r')!;
    expect(hand.height).toBe(112);
    expect(hand.sockets.grip).toEqual([60.0, 62.0]);
    expect(hand.sockets.wrap).toEqual([60.0, 24.0]);
    expect(hand.z).toBe(80);
    const sword = WORKSHOP_FRAME_MANIFEST.assets.find((a) => a.id === 'weapon_sword')!;
    expect(sword.height).toBe(244);
    expect(sword.pivot).toEqual([60, 184]);
    expect(sword.parent).toBe('hand_r');
    expect(sword.parent_socket).toBe('grip');
    expect(sword.angle).toBe(80);
    // Global 180° grip rotation removed.
    expect(
      (WORKSHOP_FRAME_MANIFEST as { weapon_grip_rotation_degrees?: number })
        .weapon_grip_rotation_degrees,
    ).toBeUndefined();
  });

  it('atomic delta seals v002→v003 and must_not_mix', () => {
    expect(integrationDelta.from.version).toBe('v002');
    expect(integrationDelta.to.version).toBe('v003');
    expect(integrationDelta.to.family).toBe('workshop-frame-v003');
    expect(V002_TORSO_FROM_HISTORY.compatible_family).toBe('workshop-frame-v002');
    const bot = assembleWorkshopFrame({ loadout: baseLoadout, facing: 'right' });
    expect(bot.kitId).toBe('workshop-frame-v003.3');
    expect(bot.atlasVersion).toBe('v3');
    expect(bot.layers.every((l) => l.label?.startsWith('workshop-frame-v003.3:'))).toBe(true);
    expect(bot.canvas.width).toBe(640);
  });

  it('maps catalogue / alias paints onto Oxide and Petrol without catalogue expansion', () => {
    expect(resolvePaintVisual('oxide').cataloguePaintId).toBe('paint-crimson');
    expect(resolvePaintVisual('petrol').cataloguePaintId).toBe('paint-cobalt');
    expect(OXIDE_PAINT.armourColor.toLowerCase()).toBe(
      WORKSHOP_FRAME_MANIFEST.paint_tokens.oxide.toLowerCase(),
    );
    expect(OXIDE_PAINT.armourColor.toLowerCase()).toBe('#e8771c');
    expect(PETROL_PAINT.armourColor.toLowerCase()).toBe(
      WORKSHOP_FRAME_MANIFEST.paint_tokens.petrol.toLowerCase(),
    );
    expect(OXIDE_PAINT.armourColor.toLowerCase()).not.toBe(PETROL_PAINT.armourColor.toLowerCase());
  });

  it('assembles body + wraps + weapon; grip world ≡ weapon pivot; no 180° special case', () => {
    const bot = assembleWorkshopFrame({ loadout: baseLoadout, facing: 'right' });
    expect(bot.placeholder).toBe(false);
    expect(bot.kitId).toBe(WORKSHOP_FRAME_KIT_ID);
    // Assembler keeps the 640 rig canvas; stage margin is overflow-only.
    expect(bot.canvas.width).toBe(640);
    expect(bot.canvas.height).toBe(640);
    // 15 body + 2 wraps + weapon
    expect(bot.layers.length).toBe(18);
    expect(bot.layers.find((l) => l.id === 'hand_r_wrap')).toBeTruthy();
    expect(bot.layers.find((l) => l.id === 'hand_l_wrap')).toBeTruthy();
    expect(bot.layers.find((l) => l.id === 'weapon_sword')).toBeTruthy();
    expect(bot.layers.every((l) => typeof l.imagePath === 'string')).toBe(true);
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
    expect(WORKSHOP_FRAME_MANIFEST.weapons.sword.grips.main.attach_angle).toBe(80);
    expect(WORKSHOP_FRAME_MANIFEST.weapons.axe.grips.main.attach_angle).toBe(90);
    expect(WORKSHOP_FRAME_MANIFEST.weapons.dagger.grips.main.attach_angle).toBe(-90);
  });

  it('applies axe z_overrides so hand_l_wrap draws over the haft', () => {
    const axe = assembleWorkshopFrame({
      loadout: { ...baseLoadout, weapon: 'weapon-axe' },
      facing: 'right',
    });
    const wrap = axe.layers.find((l) => l.id === 'hand_l_wrap')!;
    expect(wrap.zIndex).toBe(91);
    expect(WORKSHOP_FRAME_MANIFEST.weapons.axe.z_overrides?.hand_l_wrap).toBe(91);
    const weaponZ = axe.layers.find((l) => l.id === 'weapon_axe')!.zIndex;
    const handZ = axe.layers.find((l) => l.id === 'hand_r')!.zIndex;
    const rightWrapZ = axe.layers.find((l) => l.id === 'hand_r_wrap')!.zIndex;
    expect(handZ).toBeLessThan(weaponZ);
    expect(weaponZ).toBeLessThan(rightWrapZ);
  });

  it('resolves per-weapon idle stances (nested pose lookup; do not port v002 numbers)', () => {
    const swordIdle = resolveWorkshopFramePose('idle', 'sword');
    const axeIdle = resolveWorkshopFramePose('idle', 'axe');
    const daggerIdle = resolveWorkshopFramePose('idle', 'dagger');
    expect(swordIdle.root).toEqual({ x: 0, y: 10 });
    expect(axeIdle.root).toEqual({ x: -2, y: 18 });
    expect(daggerIdle.parts.torso?.rot).toBe(8);
    // Different weapons → different stances
    expect(axeIdle.root.y).not.toBe(swordIdle.root.y);
    expect(daggerIdle.parts.torso?.rot).not.toBe(swordIdle.parts.torso?.rot ?? 0);

    const swordBot = assembleWorkshopFrame({
      loadout: baseLoadout,
      facing: 'right',
      weaponId: 'sword',
      motionPose: 'idle',
    });
    const axeBot = assembleWorkshopFrame({
      loadout: baseLoadout,
      facing: 'right',
      weaponId: 'axe',
      motionPose: 'idle',
    });
    expect(swordBot.layers.find((l) => l.id === 'torso')?.rotateCwDeg).not.toBe(
      axeBot.layers.find((l) => l.id === 'torso')?.rotateCwDeg,
    );
  });

  it('swaps Oxide/Petrol via kit paint masks (shared under/over; tint token only)', () => {
    const oxideSword = assembleBot({ loadout: baseLoadout, facing: 'right', placeholder: false });
    const petrol = withPaint(oxideSword, 'petrol');
    const axe = withWeapon(oxideSword, 'weapon-axe');
    const dagger = withWeapon(oxideSword, 'dagger');

    expect(oxideSword.paintVisual).toBe('oxide');
    expect(petrol.paintVisual).toBe('petrol');

    const oxideTorso = oxideSword.layers.find((l) => l.id === 'torso')!;
    const petrolTorso = petrol.layers.find((l) => l.id === 'torso')!;
    expect(oxideTorso.materialUnderPath).toBe('materials/torso-under.png');
    expect(oxideTorso.paintMaskPath).toBe('masks/torso-paint.png');
    expect(oxideTorso.materialOverPath).toBe('materials/torso-over.png');
    expect(petrolTorso.materialUnderPath).toBe(oxideTorso.materialUnderPath);
    expect(petrolTorso.paintMaskPath).toBe(oxideTorso.paintMaskPath);
    expect(petrolTorso.materialOverPath).toBe(oxideTorso.materialOverPath);
    expect(oxideTorso.color.toLowerCase()).toBe('#e8771c');
    expect(petrolTorso.color.toLowerCase()).toBe('#27877b');
    expect(oxideTorso.imagePath).toBe('parts/torso-oxide.png');
    expect(petrolTorso.imagePath).toBe('parts/torso-petrol.png');

    expect(oxideSword.layers.find((l) => l.id === 'hand_r')?.paintMaskPath).toBeUndefined();
    expect(oxideSword.layers.find((l) => l.id === 'hand_r')?.isPaintMask).toBe(false);
    expect(oxideSword.layers.find((l) => l.id === 'weapon_sword')?.paintMaskPath).toBeUndefined();
    expect(oxideSword.layers.find((l) => l.id === 'hand_r_wrap')?.isPaintMask).toBe(false);

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
    for (const width of [170, WORKSHOP_FRAME_MANIFEST.canvas[0]]) {
      const mid = width / 2;
      expect(applyCenterOriginScaleX(0, width, -1)).toBeCloseTo(width, 10);
      expect(applyCenterOriginScaleX(width, width, -1)).toBeCloseTo(0, 10);
      expect(applyCenterOriginScaleX(mid, width, -1)).toBeCloseTo(mid, 10);
      expect(applyCenterOriginScaleX(mid / 2, width, -1)).toBeCloseTo(width - mid / 2, 10);
      const brokenDoublePivot = (x: number) => 2 * width - x;
      expect(applyCenterOriginScaleX(mid, width, -1)).not.toBeCloseTo(brokenDoublePivot(mid), 5);
    }
    expect(WORKSHOP_FRAME_MANIFEST.canvas[0]).toBe(640);
    expect(applyCenterOriginScaleX(0, 640, -1)).toBeCloseTo(640, 10);
  });

  it('uses +Y-down clockwise rotation: +90° sends +X to +Y; idle upper_arm_r elbow matches body geometry', () => {
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
    expect(elbowRel.x).toBeCloseTo(25.413, 2);
    expect(elbowRel.y).toBeCloseTo(57.078, 2);
    expect(elbowRel.x).toBeGreaterThan(0);
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

  it('records concrete Game Art adapter gaps including v003 no-mix rule', () => {
    const gaps = listWorkshopFrameGaps();
    expect(gaps.length).toBeGreaterThan(5);
    expect(gaps.some((g) => g.includes('must_not_mix_versions') || g.includes('v003'))).toBe(true);
    expect(gaps.some((g) => /need product mapping for heavy/i.test(g))).toBe(false);
    expect(gaps.some((g) => g.includes('MotionPose heavy_* is mapped'))).toBe(true);
    expect(gaps.some((g) => g.includes('weapon_sword'))).toBe(true);
    expect(gaps.some((g) => g.includes('hand_l_wrap'))).toBe(true);
  });
});
