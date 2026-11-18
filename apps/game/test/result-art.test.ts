import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assembleBot } from '../src/assembler/assemble';
import {
  NEW_RECORD_STAMP_ROTATION_DEG,
  RESULT_PLATE_SPECS,
  resultPlateDensityBucket,
} from '../src/result-art/resultPlateSpec';
import {
  VICTORY_POSE_ART_STATUS,
  VICTORY_POSE_SLOT_ID,
  isApprovedResultMotionPose,
  resolveResultBotPose,
} from '../src/result-art/resultPoseSlot';

const assetsRoot = join(__dirname, '../assets/result-plates');

describe('A3 result plates + victory/defeat poses (kit-v003.1)', () => {
  it('ships VICTORY / DEFEAT / NEW RECORD PNG 1x/2x/3x (unchanged from v003)', () => {
    for (const kind of ['victory', 'defeat', 'new-record'] as const) {
      for (const dens of ['1x', '2x', '3x'] as const) {
        expect(existsSync(join(assetsRoot, 'png', dens, `${kind}.png`))).toBe(true);
      }
      expect(existsSync(join(assetsRoot, 'svg', `${kind}.svg`))).toBe(true);
    }
    expect(RESULT_PLATE_SPECS.victory.sizePt).toEqual([300, 96]);
    expect(RESULT_PLATE_SPECS.defeat.sizePt).toEqual([300, 96]);
    expect(RESULT_PLATE_SPECS.new_record.sizePt).toEqual([220, 64]);
    expect(RESULT_PLATE_SPECS.victory.accessibilityLabel).toBe('Victory');
    expect(NEW_RECORD_STAMP_ROTATION_DEG).toBe(12);
    expect(resultPlateDensityBucket(1)).toBe(1);
    expect(resultPlateDensityBucket(2)).toBe(2);
    expect(resultPlateDensityBucket(3)).toBe(3);
  });

  it('approves kneeling defeat MotionPose for the player loadout', () => {
    const resolved = resolveResultBotPose('defeat');
    expect(resolved.status).toBe('approved');
    expect(resolved.motionPose).toBe('defeat');
    expect(isApprovedResultMotionPose(resolved)).toBe(true);
    const bot = assembleBot({
      loadout: { chassis: 'chassis-basic', paint: 'paint-crimson', weapon: 'weapon-sword' },
      facing: 'right',
      motionPose: 'defeat',
    });
    expect(bot.motionPose).toBe('defeat');
    expect(bot.kitPoseKey).toBe('defeat');
    expect(bot.layers.some((l) => l.role === 'weapon')).toBe(true);
  });

  it('approves overhead victory MotionPose (fills former pending slot)', () => {
    const resolved = resolveResultBotPose('victory');
    expect(VICTORY_POSE_ART_STATUS).toBe('approved');
    expect(resolved.kind).toBe('victory');
    expect(resolved.status).toBe('approved');
    expect(resolved.motionPose).toBe('victory');
    expect(resolved.slotId).toBe(VICTORY_POSE_SLOT_ID);
    expect(isApprovedResultMotionPose(resolved)).toBe(true);
    for (const weapon of ['weapon-sword', 'weapon-axe', 'weapon-dagger'] as const) {
      const bot = assembleBot({
        loadout: { chassis: 'chassis-basic', paint: 'paint-crimson', weapon },
        facing: 'right',
        motionPose: 'victory',
      });
      expect(bot.motionPose).toBe('victory');
      expect(bot.kitPoseKey).toBe('victory');
      expect(bot.canvas.width).toBe(640);
      expect(bot.canvas.height).toBe(640);
      expect(bot.layers.some((l) => l.role === 'weapon')).toBe(true);
    }
  });
});
