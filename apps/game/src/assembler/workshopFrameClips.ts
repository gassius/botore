/**
 * Workshop Frame kit-v003.3 baked fight clips (30 fps).
 * Playback: one frame per tick; no tween. Timing.per_weapon remains for
 * legacy adapters — Fight View prefers this module when clips are present.
 */
import clipsJson from '../../assets/workshop-frame-kit-v003/animation/clips.json';
import type { KitPoseEntry, KitWeaponKind } from './workshopFrameTypes';

export const WORKSHOP_FRAME_CLIPS_VERSION = 'v003.3' as const;

export type WorkshopFrameClipName = 'walk' | 'attack' | 'dodge' | 'hit_react' | 'knockout';

export type WorkshopFrameClipFx = {
  readonly frame: number;
  readonly label: string;
  readonly png: string;
  readonly 'png@2x'?: string;
  readonly offset_rig_px: readonly [number, number];
  readonly z?: number;
  readonly size_1x?: readonly [number, number];
};

export type WorkshopFrameClip = {
  readonly frames: readonly KitPoseEntry[];
  readonly meta: readonly {
    readonly label: string;
    readonly ease_in?: string;
    readonly grounded?: boolean;
    readonly hit_stop?: boolean;
  }[];
  readonly events?: {
    readonly contact_frame?: number;
    readonly hit_stop_frames?: readonly number[];
  } | null;
  readonly loop?: boolean;
  readonly speed_px_per_frame?: number;
  readonly ends_on_pose?: string;
  readonly fx?: readonly WorkshopFrameClipFx[];
};

type ClipsRoot = {
  readonly version: string;
  readonly fps: number;
  readonly clips: Readonly<
    Record<KitWeaponKind, Readonly<Partial<Record<WorkshopFrameClipName, WorkshopFrameClip>>>>
  >;
};

export const WORKSHOP_FRAME_CLIPS = clipsJson as unknown as ClipsRoot;

export function workshopFrameClip(
  weapon: KitWeaponKind,
  name: WorkshopFrameClipName,
): WorkshopFrameClip | null {
  return WORKSHOP_FRAME_CLIPS.clips[weapon]?.[name] ?? null;
}

export function hasWorkshopFrameClips(): boolean {
  return (
    WORKSHOP_FRAME_CLIPS.version === WORKSHOP_FRAME_CLIPS_VERSION &&
    Boolean(WORKSHOP_FRAME_CLIPS.clips.sword?.attack?.frames?.length)
  );
}
