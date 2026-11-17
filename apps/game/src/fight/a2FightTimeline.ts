/**
 * A2 first-pass fight timeline — kit-v003.1 `manifest.timing` → frame beats.
 *
 * Data-driven: new in-between pose keys (or knockout fall frames) drop in via
 * kit timing segments + poses table with no code changes. Audio markers attach
 * to pose/frame events (not hard-coded ms) so SFX stay sync when frames land.
 *
 * Design sign-off waits for the next kit pass — not final art.
 */
import { WORKSHOP_FRAME_MANIFEST } from '../assembler/workshopFrameAdapter';
import type { KitWeaponKind } from '../assembler/workshopFrameTypes';
import type { MotionPose } from '../assembler/types';
import { isMotionPose } from '../assembler/motionPoseMapping';

export const A2_FPS = 30 as const;

/** Music/SFX Director markers — fire on the first matching frame, not ms clocks. */
export type FightAudioMarker = 'swing' | 'hit' | 'dodge' | 'defeat';

export type FightTimingSequenceName = 'walk_in' | 'attack' | 'dodge' | 'hit_react' | 'knockout';

export type FightTimingSegment = {
  readonly to: string;
  readonly frames: number;
  readonly ease: string;
  readonly note?: string;
};

export type FightTimelineBeat = {
  /** Kit pose key (`timing.to`). Future in-betweens / fall keys pass through. */
  readonly poseKey: string;
  readonly frames: number;
  readonly ease: string;
  readonly hitStop: boolean;
  readonly markers: readonly FightAudioMarker[];
};

export type ExpandTimingOptions = {
  readonly sequence: FightTimingSequenceName;
  /** Attack only: include hit-stop segments when the sealed hit connects. */
  readonly hitConnects?: boolean;
  /** Snap keys, drop hit-stop hold, no walk bob (kit reducedMotion note). */
  readonly reducedMotion?: boolean;
  /**
   * Attack only: sealed `basic` trims anticipation windup/hold; `weapon` keeps
   * the full kit windup so quick vs heavy stay readable.
   */
  readonly attack?: 'basic' | 'weapon';
};

type WeaponTimingTable = {
  readonly hit_stop_frames?: number;
  readonly attack_total_frames?: number;
  readonly walk_in?: readonly FightTimingSegment[];
  readonly attack?: readonly FightTimingSegment[];
  readonly dodge?: readonly FightTimingSegment[];
  readonly hit_react?: readonly FightTimingSegment[];
  readonly knockout?: readonly FightTimingSegment[];
};

function timingRoot(): {
  readonly fps: number;
  readonly per_weapon: Readonly<Record<string, WeaponTimingTable>>;
} | null {
  const timing = (
    WORKSHOP_FRAME_MANIFEST as {
      timing?: {
        fps?: number;
        per_weapon?: Readonly<Record<string, WeaponTimingTable>>;
      };
    }
  ).timing;
  if (!timing?.per_weapon) return null;
  return { fps: timing.fps ?? A2_FPS, per_weapon: timing.per_weapon };
}

/** Canonical kit pose after pose_aliases (quick_attack→strike, …). */
export function canonicalKitPoseKey(poseKey: string): string {
  const aliases = WORKSHOP_FRAME_MANIFEST.pose_aliases ?? {};
  return aliases[poseKey] ?? poseKey;
}

/**
 * Map a kit pose key onto MotionPose for BotAssembler.
 * Unknown keys that exist in the active manifest pass through (in-betweens /
 * future knockout fall frames) without requiring a code change.
 */
export function motionPoseFromKitKey(poseKey: string): MotionPose {
  const canonical = canonicalKitPoseKey(poseKey);
  if (isMotionPose(canonical)) return canonical;
  if (isMotionPose(poseKey)) return poseKey;
  if (WORKSHOP_FRAME_MANIFEST.poses[canonical] || WORKSHOP_FRAME_MANIFEST.poses[poseKey]) {
    return poseKey as MotionPose;
  }
  return 'idle';
}

/** True when a knockout-sequence pose is a fall-to-floor in-between (future kits). */
export function isKnockoutFallPoseKey(poseKey: string): boolean {
  const key = canonicalKitPoseKey(poseKey).toLowerCase();
  return key.includes('fall') || key.startsWith('knockout_fall');
}

export function framesToMs(frames: number, fps: number = A2_FPS): number {
  if (frames <= 0) return 0;
  return (frames / fps) * 1000;
}

export function weaponTiming(
  weapon: KitWeaponKind,
): (WeaponTimingTable & { readonly fps: number }) | null {
  const root = timingRoot();
  if (!root) return null;
  const table = root.per_weapon[weapon];
  if (!table) return null;
  return { ...table, fps: root.fps };
}

/**
 * Expand kit timing segments into playback beats + audio markers.
 * Skipping hit-stop on a miss and reducedMotion are handled here so callers
 * stay free of hard-coded frame counts.
 *
 * reducedMotion drops hit-stop *hold* but keeps hit/dodge/defeat markers on
 * the surviving strike / dodge / knockout beat so SFX never go silent.
 */
export function expandTimingSegments(
  segments: readonly FightTimingSegment[],
  opts: ExpandTimingOptions,
): FightTimelineBeat[] {
  const reduced = Boolean(opts.reducedMotion);
  const hitConnects = opts.hitConnects !== false;
  const quickAttack = opts.sequence === 'attack' && opts.attack === 'basic';
  const beats: FightTimelineBeat[] = [];

  let sawStrike = false;
  let sawHitStop = false;
  let sawDodge = false;
  let sawDefeatCue = false;
  const knockoutHasFall = segments.some((s) => isKnockoutFallPoseKey(s.to));

  for (const segment of segments) {
    const ease = segment.ease;
    const isHitStop = ease === 'hit-stop';
    const poseKey = segment.to;
    const canonical = canonicalKitPoseKey(poseKey);

    if (opts.sequence === 'attack' && isHitStop && !hitConnects) {
      continue;
    }
    // Quick (basic): drop anticipation windup + hold before the first strike.
    if (quickAttack && !sawStrike) {
      if (canonical === 'windup') continue;
      if (ease === 'hold') continue;
    }
    // reducedMotion: skip hit-stop freeze; hit marker moves onto the strike beat.
    if (reduced && isHitStop) {
      continue;
    }

    let frames = Math.max(0, Math.floor(segment.frames));
    if (reduced) {
      // Snap between keys; hold already truncated.
      frames = ease === 'hold' ? Math.min(frames, 1) : 1;
    }
    if (frames <= 0) continue;

    const markers: FightAudioMarker[] = [];

    if (opts.sequence === 'attack' && canonical === 'strike' && !isHitStop && !sawStrike) {
      markers.push('swing');
      sawStrike = true;
      // When hit-stop is dropped for reduced motion, keep the hit clank on strike.
      if (reduced && hitConnects && !sawHitStop) {
        markers.push('hit');
        sawHitStop = true;
      }
    }
    if (opts.sequence === 'attack' && isHitStop && !sawHitStop) {
      markers.push('hit');
      sawHitStop = true;
    }
    if (opts.sequence === 'dodge' && canonical === 'dodge' && !sawDodge) {
      markers.push('dodge');
      sawDodge = true;
    }
    if (opts.sequence === 'knockout' && !sawDefeatCue) {
      // Until fall frames exist, fire defeat on first knockout frame.
      // When fall keys appear in timing, fire on the first fall pose instead.
      if (knockoutHasFall) {
        if (isKnockoutFallPoseKey(poseKey)) {
          markers.push('defeat');
          sawDefeatCue = true;
        }
      } else if (canonical === 'knockout') {
        markers.push('defeat');
        sawDefeatCue = true;
      }
    }

    beats.push({
      poseKey,
      frames,
      ease,
      hitStop: isHitStop,
      markers,
    });
  }

  return beats;
}

export function expandWeaponSequence(
  weapon: KitWeaponKind,
  sequence: FightTimingSequenceName,
  opts: Omit<ExpandTimingOptions, 'sequence'> = {},
): FightTimelineBeat[] {
  const table = weaponTiming(weapon);
  if (!table) return [];
  const segments = table[sequence] ?? [];
  return expandTimingSegments(segments, { ...opts, sequence });
}

/** Attack totals from kit (includes hit-stop). */
export function attackTotalFrames(weapon: KitWeaponKind): number {
  const table = weaponTiming(weapon);
  if (!table) return 0;
  if (typeof table.attack_total_frames === 'number') return table.attack_total_frames;
  return expandWeaponSequence(weapon, 'attack', { hitConnects: true }).reduce(
    (sum, b) => sum + b.frames,
    0,
  );
}

export function hitStopFrames(weapon: KitWeaponKind): number {
  const table = weaponTiming(weapon);
  if (!table) return 0;
  if (typeof table.hit_stop_frames === 'number') return table.hit_stop_frames;
  return expandWeaponSequence(weapon, 'attack', { hitConnects: true })
    .filter((b) => b.hitStop)
    .reduce((sum, b) => sum + b.frames, 0);
}
