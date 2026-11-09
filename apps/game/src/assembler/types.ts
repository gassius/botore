/**
 * Shared bot assembler contract (F7).
 *
 * Consumed by shell / F8 / fight surfaces — import from
 * `apps/game/src/assembler` (barrel). Do not fork a second renderer.
 *
 * Geometry, pivots, timings, and display sizes are PROVISIONAL until the Game
 * Art kit + phone proof. Placeholder media is labelled PLACEHOLDER.
 */

/** Facing for stable / preview / fight. Opponent typically `'left'` (mirrored). */
export type BotFacing = 'left' | 'right';

/**
 * Motion pose keys driven by RN Animated first.
 * Exact timings / deltas are PROVISIONAL — not phone-proven.
 */
export type MotionPose = 'idle' | 'attack' | 'dodge' | 'hit' | 'defeat';

/**
 * First-proof sample paints (Art Direction v0.3).
 * Catalogue ids remain `paint-crimson` / `paint-cobalt` until Game Art renames;
 * the assembler maps those ids onto Oxide / Petrol visuals without expanding
 * the server catalogue.
 */
export type SamplePaintVisual = 'oxide' | 'petrol';

/** Layer roles in draw order (back → front). */
export type AssemblerLayerRole =
  | 'shadow'
  | 'leg-back'
  | 'torso'
  | 'arm-back'
  | 'head'
  | 'paint-mask'
  | 'arm-front'
  | 'hand'
  | 'weapon'
  | 'label';

export type AssemblerLayerKind = 'metal' | 'paint' | 'weapon' | 'fx' | 'meta';

/** PROVISIONAL 2D point in kit canvas space (origin top-left). */
export interface ProvisionalPoint {
  readonly x: number;
  readonly y: number;
  /** Always true for invented kit numbers until Game Art supplies finals. */
  readonly provisional: true;
}

/**
 * Loadout fields the assembler reads. Compatible with confirmed `BotLoadout`
 * and F8 `pendingLoadout` without importing server packages.
 */
export interface AssemblerLoadoutInput {
  readonly chassis: string;
  readonly paint: string;
  readonly weapon: string;
  readonly shield?: string | null;
  readonly drone?: string | null;
  readonly decals?: readonly string[];
  readonly soundTags?: readonly string[];
}

/**
 * Props for the single shared `BotAssembler` React component.
 * Shell / F8 mount this into Stable, Customise preview, ConfirmFight, Replay.
 */
export interface BotAssemblerProps {
  /** Confirmed or pending loadout — same shape either way (F8 owns pending vs confirmed). */
  readonly loadout: AssemblerLoadoutInput;
  /** Player nearer/lower usually faces `right`; mirrored opponent faces `left`. */
  readonly facing: BotFacing;
  /** Optional paint override (preview swatch) without mutating loadout. */
  readonly paintId?: string;
  /** Optional weapon override (preview glyph) without mutating loadout. */
  readonly weaponId?: string;
  /** Default `idle`. Motion is RN Animated; Skia only if measured limits fail. */
  readonly motionPose?: MotionPose;
  /** When true, skip non-essential motion (pose snaps / reduced amplitude). */
  readonly reducedMotion?: boolean;
  /**
   * When true, render geometric PLACEHOLDER stand-ins. When false/omitted,
   * use Workshop Frame kit-v002 (local integration only — not likeness/native
   * acceptance).
   */
  readonly placeholder?: boolean;
  /** PROVISIONAL display width in dp; not a locked export size. */
  readonly size?: number;
  /** Optional accessibility / test id. */
  readonly testID?: string;
}

export interface AssembledLayer {
  readonly id: string;
  readonly role: AssemblerLayerRole;
  readonly kind: AssemblerLayerKind;
  readonly zIndex: number;
  /** Local rect / top-left in kit canvas units (PROVISIONAL when placeholder). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Fill used for PLACEHOLDER vector stand-ins / tint. */
  readonly color: string;
  /** True when this layer is the recolourable armour mask. */
  readonly isPaintMask: boolean;
  /** Attachment parent role, if any (weapon → hand grip). */
  readonly attachTo?: AssemblerLayerRole;
  /** Offset from parent pivot (PROVISIONAL). */
  readonly attachOffset?: ProvisionalPoint;
  readonly label?: string;
  /** Relative path under workshop-frame-kit-v002 (e.g. parts/torso-oxide.png). */
  readonly imagePath?: string;
  readonly pivotX?: number;
  readonly pivotY?: number;
  readonly worldPivotX?: number;
  readonly worldPivotY?: number;
  /** Clockwise degrees in kit canvas space (before facing mirror). */
  readonly rotateCwDeg?: number;
}

export interface AssembledBot {
  readonly atlasVersion: 'v1';
  readonly chassisId: string;
  readonly paintId: string;
  readonly paintVisual: SamplePaintVisual;
  readonly weaponId: string;
  readonly weaponKind: 'sword' | 'axe' | 'dagger';
  readonly facing: BotFacing;
  readonly mirrored: boolean;
  readonly motionPose: MotionPose;
  readonly placeholder: boolean;
  /** PROVISIONAL kit canvas size. */
  readonly canvas: { readonly width: number; readonly height: number; readonly provisional: true };
  readonly grip: ProvisionalPoint;
  readonly layers: readonly AssembledLayer[];
  /** Set when assembled from Game Art workshop-frame-v002. */
  readonly kitId?: string;
  readonly kitPoseKey?: string;
}
