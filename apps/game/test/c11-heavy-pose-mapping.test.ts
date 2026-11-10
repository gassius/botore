import { describe, expect, it } from 'vitest';
import { assembleBot, provisionalMotionOffset } from '../src/assembler/assemble';
import {
  MOTION_POSES,
  isHeavyMotionPose,
  isMotionPose,
  motionPoseFromSealedAttack,
} from '../src/assembler/motionPoseMapping';
import { MOTION_POSE_TO_KIT, listWorkshopFrameGaps } from '../src/assembler/workshopFrameAdapter';
import { applyAnimationCommand, initialPresentationState } from '../src/replay/playbackState';
import { compileAnimationQueue, commandDuration } from '../src/replay-playback';
import { sfxClipFromCommand } from '../src/audio/cueFromCommand';
import { sealReplay, type BattleReplay } from '@botore/replay';

const loadout = {
  chassis: 'chassis-basic',
  paint: 'paint-crimson',
  weapon: 'weapon-sword',
};

describe('C11 heavy-hit pose mapping', () => {
  it('extends MotionPose (no parallel kitPoseKey prop) with heavy_* keys', () => {
    expect(MOTION_POSES).toEqual([
      'idle',
      'attack',
      'heavy_windup',
      'heavy_attack',
      'dodge',
      'hit',
      'defeat',
    ]);
    expect(isMotionPose('heavy_windup')).toBe(true);
    expect(isMotionPose('heavy_attack')).toBe(true);
    expect(isMotionPose('quick_attack')).toBe(false);
    expect(isHeavyMotionPose('heavy_windup')).toBe(true);
    expect(isHeavyMotionPose('attack')).toBe(false);
  });

  it('maps sealed basic→quick and weapon→heavy windup/strike', () => {
    expect(motionPoseFromSealedAttack('basic')).toBe('attack');
    expect(motionPoseFromSealedAttack('weapon', 'windup')).toBe('heavy_windup');
    expect(motionPoseFromSealedAttack('weapon', 'strike')).toBe('heavy_attack');
    expect(MOTION_POSE_TO_KIT.attack).toBe('quick_attack');
    expect(MOTION_POSE_TO_KIT.heavy_windup).toBe('heavy_windup');
    expect(MOTION_POSE_TO_KIT.heavy_attack).toBe('heavy_attack');
  });

  it('assembles distinct kit geometry for quick vs heavy on shared BotAssembler API', () => {
    const quick = assembleBot({ loadout, facing: 'right', motionPose: 'attack' });
    const windup = assembleBot({ loadout, facing: 'right', motionPose: 'heavy_windup' });
    const heavy = assembleBot({ loadout, facing: 'left', motionPose: 'heavy_attack' });
    expect(quick.kitPoseKey).toBe('quick_attack');
    expect(windup.kitPoseKey).toBe('heavy_windup');
    expect(heavy.kitPoseKey).toBe('heavy_attack');
    expect(heavy.mirrored).toBe(true);
    // Distinct root placement / part transforms vs quick (v002 heavy_windup.root_y=45).
    const quickTorso = quick.layers.find((l) => l.id === 'torso')!;
    const windupTorso = windup.layers.find((l) => l.id === 'torso')!;
    const heavyTorso = heavy.layers.find((l) => l.id === 'torso')!;
    expect(windupTorso.y).not.toBe(quickTorso.y);
    expect(heavyTorso.rotateCwDeg).not.toBe(quickTorso.rotateCwDeg);
  });

  it('compiles sealed weapon attacks into windup then strike without inventing outcomes', () => {
    const replay: BattleReplay = sealReplay({
      replayVersion: 1,
      rulesVersion: 'combat-v1',
      battleId: 'b-c11',
      seed: 'aabbccdd00112233aabbccdd00112233',
      inputHash: 'c'.repeat(64),
      fighters: [
        {
          characterId: 'near',
          displayName: 'Near',
          hp: 20,
          strength: 5,
          agility: 5,
          speed: 5,
          weaponKind: 'sword',
          weaponPower: 4,
        },
        {
          characterId: 'far',
          displayName: 'Far',
          hp: 20,
          strength: 5,
          agility: 5,
          speed: 5,
          weaponKind: 'axe',
          weaponPower: 5,
        },
      ],
      events: [
        { seq: 0, type: 'battle_started', attacker: 'near', defender: 'far' },
        { seq: 1, type: 'turn_started', actor: 'near' },
        { seq: 2, type: 'attack_selected', actor: 'near', attack: 'basic' },
        { seq: 3, type: 'turn_started', actor: 'far' },
        { seq: 4, type: 'attack_selected', actor: 'far', attack: 'weapon' },
        { seq: 5, type: 'battle_ended', winner: 'near', reason: 'defeat' },
      ],
      outcome: { winner: 'near', loser: 'far', reason: 'defeat' },
    });

    const queue = compileAnimationQueue(replay);
    const attacks = queue.filter((c) => c.kind === 'attack_anim');
    expect(attacks).toEqual([
      { kind: 'attack_anim', actor: 'near', attack: 'basic' },
      { kind: 'attack_anim', actor: 'far', attack: 'weapon', heavyPhase: 'windup' },
      { kind: 'attack_anim', actor: 'far', attack: 'weapon', heavyPhase: 'strike' },
    ]);
    expect(commandDuration(attacks[1]!)).toBe(280);
    expect(commandDuration(attacks[2]!)).toBe(420);
    expect(sfxClipFromCommand(attacks[1]!)).toBeNull();
    expect(sfxClipFromCommand(attacks[2]!)).toBe('swing');
    expect(sfxClipFromCommand(attacks[0]!)).toBe('swing');
  });

  it('drives presentation poses from sealed attack_anim commands', () => {
    let state = initialPresentationState('near', 'far');
    const maxHp = { near: 20, far: 20 };

    state = applyAnimationCommand(
      state,
      { kind: 'attack_anim', actor: 'near', attack: 'basic' },
      1,
      maxHp,
    );
    expect(state.near.motionPose).toBe('attack');

    state = applyAnimationCommand(
      state,
      { kind: 'attack_anim', actor: 'far', attack: 'weapon', heavyPhase: 'windup' },
      2,
      maxHp,
    );
    expect(state.far.motionPose).toBe('heavy_windup');

    state = applyAnimationCommand(
      state,
      { kind: 'attack_anim', actor: 'far', attack: 'weapon', heavyPhase: 'strike' },
      3,
      maxHp,
    );
    expect(state.far.motionPose).toBe('heavy_attack');
  });

  it('does not list unmapped heavy poses as a blocking workshop gap', () => {
    const gaps = listWorkshopFrameGaps();
    expect(gaps.some((g) => /need product mapping for heavy/i.test(g))).toBe(false);
    expect(gaps.some((g) => g.includes('MotionPose heavy_* is mapped'))).toBe(true);
    expect(gaps.some((g) => g.includes('heavy_windup.root_y'))).toBe(true);
  });

  it('gives PLACEHOLDER heavy poses non-zero provisional offsets', () => {
    expect(provisionalMotionOffset('heavy_windup', false).rotateDeg).not.toBe(0);
    expect(provisionalMotionOffset('heavy_attack', false).translateX).toBeGreaterThan(
      provisionalMotionOffset('attack', false).translateX,
    );
  });
});
