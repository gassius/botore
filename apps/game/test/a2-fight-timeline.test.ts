/**
 * A2b: kit-v003.3 clips → Fight View beats + frame-marker SFX.
 */
import { describe, expect, it } from 'vitest';
import { sealReplay, type BattleReplay } from '@botore/replay';
import {
  A2_FPS,
  attackTotalFrames,
  canonicalKitPoseKey,
  expandTimingSegments,
  expandWeaponSequence,
  framesToMs,
  hitStopFrames,
  isKnockoutFallPoseKey,
  motionPoseFromKitKey,
} from '../src/fight/a2FightTimeline';
import { compileAnimationQueue, commandDuration } from '../src/replay-playback';
import { sfxClipFromCommand, sfxClipsFromCommand } from '../src/audio/cueFromCommand';
import { applyAnimationCommand, initialPresentationState } from '../src/replay/playbackState';
import { WORKSHOP_FRAME_MANIFEST } from '../src/assembler/workshopFrameAdapter';
import { hasWorkshopFrameClips, workshopFrameClip } from '../src/assembler/workshopFrameClips';
import { MOTION_POSES, isMotionPose } from '../src/assembler/motionPoseMapping';

function swordConnectReplay(): BattleReplay {
  return sealReplay({
    replayVersion: 1,
    rulesVersion: 'combat-v1',
    battleId: 'b-a2-sword',
    seed: 'aabbccdd00112233aabbccdd00112233',
    inputHash: 'a'.repeat(64),
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
      { seq: 3, type: 'damage_applied', target: 'far', amount: 4, targetHpAfter: 16 },
      { seq: 4, type: 'turn_started', actor: 'far' },
      { seq: 5, type: 'attack_selected', actor: 'far', attack: 'weapon' },
      { seq: 6, type: 'dodged', actor: 'near' },
      { seq: 7, type: 'character_defeated', characterId: 'far' },
      { seq: 8, type: 'battle_ended', winner: 'near', reason: 'defeat' },
    ],
    outcome: { winner: 'near', loser: 'far', reason: 'defeat' },
  });
}

describe('A2b kit-v003.3 clips', () => {
  it('pins 30 fps clips and per-weapon attack totals / hit-stop', () => {
    expect(hasWorkshopFrameClips()).toBe(true);
    expect(WORKSHOP_FRAME_MANIFEST.timing?.fps).toBe(A2_FPS);
    expect(attackTotalFrames('sword')).toBe(41);
    expect(attackTotalFrames('axe')).toBe(56);
    expect(attackTotalFrames('dagger')).toBe(33);
    expect(hitStopFrames('sword')).toBe(3);
    expect(hitStopFrames('axe')).toBe(5);
    expect(hitStopFrames('dagger')).toBe(2);
    expect(workshopFrameClip('sword', 'knockout')?.ends_on_pose).toBe('defeat');
  });

  it('exposes A2 MotionPose keys and alias canonicalisation', () => {
    for (const key of [
      'walk_in',
      'windup',
      'strike',
      'follow_through',
      'recovery',
      'dodge',
      'hit_react',
      'knockout',
    ] as const) {
      expect(isMotionPose(key)).toBe(true);
      expect(MOTION_POSES).toContain(key);
    }
    expect(canonicalKitPoseKey('quick_attack')).toBe('strike');
    expect(canonicalKitPoseKey('heavy_windup')).toBe('windup');
    expect(canonicalKitPoseKey('hit')).toBe('hit_react');
    expect(motionPoseFromKitKey('strike')).toBe('strike');
    expect(motionPoseFromKitKey('quick_attack')).toBe('strike');
  });

  it('passes future in-between / fall pose keys through without code changes', () => {
    expect(isKnockoutFallPoseKey('knockout_fall_01')).toBe(true);
    expect(isKnockoutFallPoseKey('knockout_fall_floor')).toBe(true);
    expect(isKnockoutFallPoseKey('knockout')).toBe(false);
    const withFall = expandTimingSegments(
      [
        { to: 'knockout', frames: 3, ease: 'ease-out' },
        { to: 'knockout_fall_01', frames: 6, ease: 'linear' },
        { to: 'defeat', frames: 8, ease: 'ease-in' },
      ],
      { sequence: 'knockout' },
    );
    expect(withFall.map((b) => b.poseKey)).toEqual(['knockout', 'knockout_fall_01', 'defeat']);
    expect(withFall.find((b) => b.poseKey === 'knockout')?.markers).toEqual([]);
    expect(withFall.find((b) => b.poseKey === 'knockout_fall_01')?.markers).toEqual(['defeat']);
  });
});

describe('A2b frame-marker audio cues', () => {
  it('marks swing on contact frame and hit on first hit-stop frame', () => {
    const beats = expandWeaponSequence('sword', 'attack', { hitConnects: true });
    const swing = beats.find((b) => b.markers.includes('swing'));
    const hit = beats.find((b) => b.markers.includes('hit'));
    expect(swing?.poseKey).toBe('strike');
    expect(swing?.hitStop).toBe(false);
    expect(swing?.pose).toBeTruthy();
    expect(hit?.hitStop).toBe(true);
    expect(hit?.frames).toBe(1);
    // Swing must not fire on windup.
    expect(beats.filter((b) => b.poseKey === 'windup').every((b) => b.markers.length === 0)).toBe(
      true,
    );
    // Smear tiles ride strike-adjacent frames.
    expect(beats.some((b) => b.smear?.png.includes('smear-sword'))).toBe(true);
  });

  it('skips hit-stop (and hit cue) on a miss; reducedMotion keeps hit on strike', () => {
    const miss = expandWeaponSequence('axe', 'attack', { hitConnects: false });
    expect(miss.some((b) => b.hitStop)).toBe(false);
    expect(miss.some((b) => b.markers.includes('hit'))).toBe(false);
    expect(miss.some((b) => b.markers.includes('swing'))).toBe(true);
    expect(miss.reduce((n, b) => n + b.frames, 0)).toBe(56 - 5);

    const reduced = expandWeaponSequence('dagger', 'attack', {
      hitConnects: true,
      reducedMotion: true,
    });
    expect(reduced.some((b) => b.hitStop)).toBe(false);
    expect(reduced.every((b) => b.frames === 1)).toBe(true);
    const strike = reduced.find((b) => b.markers.includes('swing'));
    expect(strike?.markers).toContain('hit');
    expect(expandWeaponSequence('sword', 'dodge', { reducedMotion: true })[0]?.markers).toEqual([
      'dodge',
    ]);
    expect(
      expandWeaponSequence('sword', 'knockout', { reducedMotion: true }).some((b) =>
        b.markers.includes('defeat'),
      ),
    ).toBe(true);
  });

  it('trims windup/hold for basic; weapon keeps full anticipation', () => {
    const basic = expandWeaponSequence('sword', 'attack', {
      hitConnects: true,
      attack: 'basic',
    });
    const heavy = expandWeaponSequence('sword', 'attack', {
      hitConnects: true,
      attack: 'weapon',
    });
    expect(basic.some((b) => b.poseKey === 'windup')).toBe(false);
    expect(heavy.some((b) => b.poseKey === 'windup')).toBe(true);
    expect(basic.reduce((n, b) => n + b.frames, 0)).toBeLessThan(
      heavy.reduce((n, b) => n + b.frames, 0),
    );
    expect(basic.some((b) => b.markers.includes('swing'))).toBe(true);
    expect(heavy.some((b) => b.markers.includes('swing'))).toBe(true);
  });

  it('marks dodge on first dodge frame and defeat on first fall frame', () => {
    const dodge = expandWeaponSequence('sword', 'dodge');
    expect(dodge[0]?.markers).toEqual(['dodge']);
    const ko = expandWeaponSequence('sword', 'knockout');
    const defeat = ko.find((b) => b.markers.includes('defeat'));
    expect(defeat).toBeTruthy();
    expect(isKnockoutFallPoseKey(defeat!.poseKey)).toBe(true);
    expect(ko.at(-1)?.poseKey).toBe('defeat');
    expect(ko.every((b) => b.pose)).toBe(true);
  });

  it('compiled queue fires cues only on those frame markers', () => {
    const queue = compileAnimationQueue(swordConnectReplay());
    const markers = queue.flatMap((cmd) => (cmd.kind === 'motion_beat' ? [...cmd.markers] : []));
    expect(markers.filter((m) => m === 'swing').length).toBeGreaterThanOrEqual(1);
    expect(markers.filter((m) => m === 'hit').length).toBe(1); // near connect only
    expect(markers).toContain('dodge');
    expect(markers).toContain('defeat');

    const swingBeat = queue.find((c) => c.kind === 'motion_beat' && c.markers.includes('swing'));
    const hitBeat = queue.find((c) => c.kind === 'motion_beat' && c.markers.includes('hit'));
    const dodgeBeat = queue.find((c) => c.kind === 'motion_beat' && c.markers.includes('dodge'));
    const defeatBeat = queue.find((c) => c.kind === 'motion_beat' && c.markers.includes('defeat'));
    expect(sfxClipsFromCommand(swingBeat!)).toEqual(['swing']);
    expect(sfxClipsFromCommand(hitBeat!)).toEqual(['hit']);
    expect(sfxClipsFromCommand(dodgeBeat!)).toEqual(['dodge']);
    expect(sfxClipsFromCommand(defeatBeat!)).toEqual(['defeat']);
    expect(
      sfxClipFromCommand({ kind: 'damage_pop', target: 'far', amount: 1, hpAfter: 1 }),
    ).toBeNull();
    expect(sfxClipFromCommand({ kind: 'defeat_anim', characterId: 'far' })).toBeNull();
  });

  it('interleaves damage_pop on the hit frame and dodge on the strike frame', () => {
    const queue = compileAnimationQueue(swordConnectReplay());
    const hitIdx = queue.findIndex((c) => c.kind === 'motion_beat' && c.markers.includes('hit'));
    const damageIdx = queue.findIndex((c) => c.kind === 'damage_pop');
    expect(hitIdx).toBeGreaterThan(0);
    expect(damageIdx).toBe(hitIdx - 1);

    const swingIdx = queue.findIndex(
      (c) => c.kind === 'motion_beat' && c.actor === 'far' && c.markers.includes('swing'),
    );
    const dodgeIdx = queue.findIndex(
      (c) => c.kind === 'motion_beat' && c.markers.includes('dodge'),
    );
    expect(swingIdx).toBeGreaterThan(0);
    expect(dodgeIdx).toBe(swingIdx + 1);

    const reduced = compileAnimationQueue(swordConnectReplay(), { reducedMotion: true });
    const reducedMarkers = reduced.flatMap((c) => (c.kind === 'motion_beat' ? [...c.markers] : []));
    expect(reducedMarkers).toContain('hit');
    expect(reducedMarkers).toContain('dodge');
    expect(reducedMarkers).toContain('defeat');
    expect(reduced.some((c) => c.kind === 'motion_beat' && c.hitStop)).toBe(false);
  });

  it('durations follow frame counts at 30 fps (not hard-coded attack ms)', () => {
    const beats = expandWeaponSequence('sword', 'attack', { hitConnects: true });
    const totalFrames = beats.reduce((n, b) => n + b.frames, 0);
    expect(totalFrames).toBe(41);
    const ms = beats.reduce((n, b) => n + framesToMs(b.frames, A2_FPS), 0);
    expect(ms).toBeCloseTo(framesToMs(41, A2_FPS), 5);
    expect(
      commandDuration({
        kind: 'motion_beat',
        actor: 'a',
        poseKey: 'strike',
        frames: 3,
        markers: [],
      }),
    ).toBe(framesToMs(3, A2_FPS));
  });
});

describe('A2b presentation + hit-stop victim freeze', () => {
  it('applies strike to attacker and hit_react to victim on hit-stop beat', () => {
    let state = initialPresentationState('near', 'far');
    const maxHp = { near: 20, far: 20 };
    const pose = workshopFrameClip('sword', 'attack')!.frames[19]!;
    state = applyAnimationCommand(
      state,
      {
        kind: 'motion_beat',
        actor: 'near',
        poseKey: 'strike',
        frames: 1,
        markers: ['hit'],
        hitStop: true,
        pose,
        victimId: 'far',
        victimPoseKey: 'hit_react',
      },
      1,
      maxHp,
    );
    expect(state.near.motionPose).toBe('strike');
    expect(state.near.poseOverride).toEqual(pose);
    expect(state.far.motionPose).toBe('hit_react');
  });
});
