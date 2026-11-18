/**
 * A2b fight timeline — kit-v003.3 `animation/clips.json` → frame beats.
 *
 * Prefers baked 30 fps clips (one pose per tick, in-betweens + smears). Falls
 * back to `manifest.timing` segments only when clips are absent. Audio markers
 * attach to pose/frame events (not hard-coded ms).
 */
import { WORKSHOP_FRAME_MANIFEST } from '../assembler/workshopFrameAdapter';
import {
  hasWorkshopFrameClips,
  workshopFrameClip,
  type WorkshopFrameClipName,
} from '../assembler/workshopFrameClips';
import type { KitPoseEntry, KitWeaponKind } from '../assembler/workshopFrameTypes';
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

export type FightTimelineSmear = {
  readonly png: string;
  readonly offsetRigPx: readonly [number, number];
  readonly z: number;
};

export type FightTimelineBeat = {
  /** Kit pose key (`timing.to` or clip meta label). */
  readonly poseKey: string;
  readonly frames: number;
  readonly ease: string;
  readonly hitStop: boolean;
  readonly markers: readonly FightAudioMarker[];
  /** Baked clip pose for this tick (v003.3+). */
  readonly pose?: KitPoseEntry;
  /** Attack smear tile for this tick when present. */
  readonly smear?: FightTimelineSmear;
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

const SEQUENCE_TO_CLIP: Readonly<Record<FightTimingSequenceName, WorkshopFrameClipName>> = {
  walk_in: 'walk',
  attack: 'attack',
  dodge: 'dodge',
  hit_react: 'hit_react',
  knockout: 'knockout',
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

/** True when a knockout-sequence pose is a fall-to-floor in-between. */
export function isKnockoutFallPoseKey(poseKey: string): boolean {
  const key = canonicalKitPoseKey(poseKey).toLowerCase();
  return (
    key.includes('fall') ||
    key.includes('floor') ||
    key.startsWith('knockout_fall') ||
    key === 'buckle'
  );
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

function poseKeyFromClipLabel(label: string, lastKey: string): string {
  if (label.startsWith('key:')) return label.slice(4);
  if (label.startsWith('breakdown:')) {
    const name = label.slice('breakdown:'.length);
    if (name.includes('fall') || name === 'floor') return `knockout_fall_${name}`;
    return name;
  }
  if (label === 'hit_stop' || label === 'inbetween' || label === 'hold') {
    return lastKey || 'idle';
  }
  return lastKey || 'idle';
}

function isKeyLabel(label: string): boolean {
  return label.startsWith('key:');
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

function expandFromClips(
  weapon: KitWeaponKind,
  sequence: FightTimingSequenceName,
  opts: Omit<ExpandTimingOptions, 'sequence'>,
): FightTimelineBeat[] | null {
  if (!hasWorkshopFrameClips()) return null;
  const clip = workshopFrameClip(weapon, SEQUENCE_TO_CLIP[sequence]);
  if (!clip?.frames?.length) return null;

  const reduced = Boolean(opts.reducedMotion);
  const hitConnects = opts.hitConnects !== false;
  const quickAttack = sequence === 'attack' && opts.attack === 'basic';
  const contactFrame =
    typeof clip.events?.contact_frame === 'number' ? clip.events.contact_frame : -1;
  const hitStopSet = new Set(clip.events?.hit_stop_frames ?? []);
  const fxByFrame = new Map((clip.fx ?? []).map((f) => [f.frame, f] as const));

  const knockoutHasFall = clip.meta.some((m) => {
    const label = m.label.toLowerCase();
    return label.includes('fall') || label.includes('floor');
  });
  let defeatFrameIndex = -1;
  if (sequence === 'knockout') {
    if (knockoutHasFall) {
      defeatFrameIndex = clip.meta.findIndex((m) => {
        const label = m.label.toLowerCase();
        return label.includes('fall') || label.includes('floor');
      });
    } else {
      defeatFrameIndex = clip.meta.findIndex(
        (m) => m.label === 'key:knockout' || m.label === 'key:impact' || m.label === 'key:stagger',
      );
    }
  }

  let firstStrikeIndex = -1;
  for (let i = 0; i < clip.meta.length; i += 1) {
    if (clip.meta[i]!.label === 'key:strike' || i === contactFrame) {
      firstStrikeIndex = i;
      break;
    }
  }

  const beats: FightTimelineBeat[] = [];
  let lastKey = 'idle';
  let sawSwing = false;
  let sawHit = false;
  let sawDodge = false;
  let sawDefeat = false;

  for (let i = 0; i < clip.frames.length; i += 1) {
    const meta = clip.meta[i] ?? { label: 'inbetween' };
    const label = meta.label;
    const isHitStop = Boolean(meta.hit_stop) || hitStopSet.has(i) || label === 'hit_stop';

    if (isKeyLabel(label)) {
      lastKey = label.slice(4);
    }

    if (sequence === 'attack' && isHitStop && !hitConnects) {
      continue;
    }
    if (quickAttack && firstStrikeIndex >= 0 && i < firstStrikeIndex) {
      continue;
    }
    if (reduced && isHitStop) {
      continue;
    }
    // reducedMotion: snap to authored keys (+ contact frame so swing survives).
    if (reduced && !isKeyLabel(label) && i !== contactFrame) {
      continue;
    }

    const poseKey = poseKeyFromClipLabel(label, lastKey);
    const markers: FightAudioMarker[] = [];

    // Swing on contact_frame (preferred) or first non-hit-stop strike key.
    const isSwingFrame =
      sequence === 'attack' &&
      !sawSwing &&
      !isHitStop &&
      (i === contactFrame || (contactFrame < 0 && poseKey === 'strike'));
    if (isSwingFrame) {
      markers.push('swing');
      sawSwing = true;
      if (reduced && hitConnects && !sawHit) {
        markers.push('hit');
        sawHit = true;
      }
    }
    if (sequence === 'attack' && isHitStop && !sawHit && hitConnects) {
      markers.push('hit');
      sawHit = true;
    }
    if (sequence === 'dodge' && !sawDodge) {
      markers.push('dodge');
      sawDodge = true;
    }
    if (sequence === 'knockout' && !sawDefeat && defeatFrameIndex >= 0) {
      if (i === defeatFrameIndex || (reduced && i >= defeatFrameIndex)) {
        markers.push('defeat');
        sawDefeat = true;
      }
    }

    const fx = fxByFrame.get(i);
    const smear: FightTimelineSmear | undefined = fx
      ? {
          png: fx.png,
          offsetRigPx: fx.offset_rig_px,
          z: fx.z ?? 84,
        }
      : undefined;

    const pose = clip.frames[i];
    beats.push({
      poseKey,
      frames: 1,
      ease: isHitStop ? 'hit-stop' : (meta.ease_in ?? 'linear'),
      hitStop: isHitStop,
      markers,
      ...(pose ? { pose } : {}),
      ...(smear ? { smear } : {}),
    });
  }

  // reducedMotion knockout with no fall frame kept: still emit defeat once.
  if (sequence === 'knockout' && !sawDefeat && beats.length > 0) {
    const last = beats[beats.length - 1]!;
    beats[beats.length - 1] = {
      ...last,
      markers: [...last.markers, 'defeat'],
    };
  }

  return beats;
}

export function expandWeaponSequence(
  weapon: KitWeaponKind,
  sequence: FightTimingSequenceName,
  opts: Omit<ExpandTimingOptions, 'sequence'> = {},
): FightTimelineBeat[] {
  const fromClips = expandFromClips(weapon, sequence, opts);
  if (fromClips) return fromClips;

  const table = weaponTiming(weapon);
  if (!table) return [];
  const segments = table[sequence] ?? [];
  return expandTimingSegments(segments, { ...opts, sequence });
}

/** Attack totals from kit clips (includes hit-stop) or timing table. */
export function attackTotalFrames(weapon: KitWeaponKind): number {
  if (hasWorkshopFrameClips()) {
    const clip = workshopFrameClip(weapon, 'attack');
    if (clip?.frames?.length) return clip.frames.length;
  }
  const table = weaponTiming(weapon);
  if (!table) return 0;
  if (typeof table.attack_total_frames === 'number') return table.attack_total_frames;
  return expandWeaponSequence(weapon, 'attack', { hitConnects: true }).reduce(
    (sum, b) => sum + b.frames,
    0,
  );
}

export function hitStopFrames(weapon: KitWeaponKind): number {
  if (hasWorkshopFrameClips()) {
    const clip = workshopFrameClip(weapon, 'attack');
    const listed = clip?.events?.hit_stop_frames;
    if (listed?.length) return listed.length;
  }
  const table = weaponTiming(weapon);
  if (!table) return 0;
  if (typeof table.hit_stop_frames === 'number') return table.hit_stop_frames;
  return expandWeaponSequence(weapon, 'attack', { hitConnects: true })
    .filter((b) => b.hitStop)
    .reduce((sum, b) => sum + b.frames, 0);
}
