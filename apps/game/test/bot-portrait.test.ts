import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleBot } from '../src/assembler/assemble';
import {
  MOTION_POSE_TO_KIT,
  resolveKitPoseKey,
  WORKSHOP_FRAME_MANIFEST,
} from '../src/assembler/workshopFrameAdapter';
import {
  PORTRAIT_CROP_RECT_CANVAS_PX,
  PORTRAIT_DISPLAY_PT,
  PORTRAIT_FORBIDDEN_SAMPLE_REQUIRES,
  PORTRAIT_POSE_PREFERRED,
  portraitCropLayout,
} from '../src/portrait/portraitSpec';

const chassis = 'chassis-basic';

describe('A5 BotPortrait — per-bot paint + weapon (never sample sheets)', () => {
  it('exposes 46 pt display and kit-v003.1 crop rect', () => {
    expect(PORTRAIT_DISPLAY_PT).toBe(46);
    expect(PORTRAIT_CROP_RECT_CANVAS_PX).toEqual([190, 41.4, 272, 272]);
    const layout = portraitCropLayout(PORTRAIT_DISPLAY_PT);
    expect(layout.cropSize).toBe(46);
    expect(layout.canvasSize).toBeCloseTo((800 * 46) / 272, 5);
  });

  it('prefers portrait MotionPose; adapter keeps weapon equipped', () => {
    expect(PORTRAIT_POSE_PREFERRED).toBe('portrait');
    expect(MOTION_POSE_TO_KIT.portrait).toBe('portrait');
    expect(resolveKitPoseKey('portrait', WORKSHOP_FRAME_MANIFEST)).toBe('portrait');
    const sword = assembleBot({
      loadout: { chassis, paint: 'paint-crimson', weapon: 'weapon-sword' },
      facing: 'right',
      motionPose: 'portrait',
    });
    const axe = assembleBot({
      loadout: { chassis, paint: 'paint-crimson', weapon: 'weapon-axe' },
      facing: 'right',
      motionPose: 'portrait',
    });
    expect(sword.weaponKind).toBe('sword');
    expect(axe.weaponKind).toBe('axe');
    expect(sword.layers.some((l) => l.role === 'weapon')).toBe(true);
    expect(axe.layers.some((l) => l.role === 'weapon')).toBe(true);
    expect(sword.paintVisual).toBe('oxide');
    const petrol = assembleBot({
      loadout: { chassis, paint: 'paint-cobalt', weapon: 'weapon-dagger' },
      facing: 'right',
      motionPose: 'portrait',
    });
    expect(petrol.paintVisual).toBe('petrol');
    expect(petrol.weaponKind).toBe('dagger');
  });

  it('BotPortrait.tsx mounts BotAssembler and never requires sample sheets', () => {
    const src = readFileSync(join(__dirname, '../src/portrait/BotPortrait.tsx'), 'utf8');
    expect(src.includes('BotAssembler')).toBe(true);
    expect(src.includes('require(')).toBe(false);
    for (const frag of PORTRAIT_FORBIDDEN_SAMPLE_REQUIRES) {
      expect(src.includes(frag)).toBe(false);
    }
  });

  it('distinct paint×weapon combos stay distinct under portrait assembly', () => {
    const combos = [
      { paint: 'paint-crimson', weapon: 'weapon-sword' },
      { paint: 'paint-crimson', weapon: 'weapon-axe' },
      { paint: 'paint-cobalt', weapon: 'weapon-sword' },
      { paint: 'paint-cobalt', weapon: 'weapon-dagger' },
    ] as const;
    const keys = combos.map((c) => {
      const bot = assembleBot({
        loadout: { chassis, paint: c.paint, weapon: c.weapon },
        facing: 'right',
        motionPose: 'portrait',
      });
      return `${bot.paintVisual}:${bot.weaponKind}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
});
