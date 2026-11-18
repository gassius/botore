/** Subset of kit-v003.3 manifest used by the F7 adapter (not a competing public API). */

export type KitPaintId =
  | 'oxide'
  | 'petrol'
  | 'primer'
  | 'ink'
  | 'drab'
  | 'cobalt'
  | 'frost'
  | 'cinder'
  | 'hazard'
  | 'racing';

export type KitWeaponKind = 'sword' | 'axe' | 'dagger' | 'mace' | 'hammer' | 'spear' | 'shield';

/** v003.1 drawing surface (rig stays 640; stage grows for victory / A2). */
export interface KitStage {
  readonly size: readonly [number, number];
  readonly rig_origin: readonly [number, number];
  readonly used_by?: readonly string[];
}

export interface KitAsset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly pivot: readonly [number, number];
  readonly sockets: Readonly<Record<string, readonly [number, number]>>;
  readonly slot: string;
  readonly parent: string | null;
  readonly parent_socket: string | null;
  readonly angle: number;
  readonly z: number;
  readonly motion_bounds: readonly [number, number];
  readonly compatible_family: string;
  readonly role?: string;
  /** Precomposited paint renders (reference / offline). Keys are paint ids. */
  readonly files: Readonly<Record<string, string>>;
  /** Steel/frame under layer — paint composite step 1. */
  readonly material_under: string;
  /** Outlines / cel shading / metal details — paint composite step 3. */
  readonly material_over: string;
  /** Paint mask path — alpha only; tint to paint token (step 2). */
  readonly paint_mask: string;
  readonly has_paint: boolean;
}

/** v003 nested pose entry: root offset + per-part rot deltas. */
export interface KitPoseEntry {
  readonly root: { readonly x: number; readonly y: number };
  readonly parts: Readonly<Record<string, { readonly rot?: number }>>;
}

/** poses[poseId][weaponId | "*"] */
export type KitPoseTable = Readonly<Record<string, KitPoseEntry>>;

export interface KitWeaponGrip {
  readonly weapon_socket: string;
  readonly hand: string;
  readonly hand_socket: string;
  readonly attach_angle: number;
  readonly offset?: readonly [number, number];
}

export interface KitWeaponDef {
  readonly asset: string;
  readonly hands?: string;
  readonly grips: {
    readonly main: KitWeaponGrip;
    readonly off?: KitWeaponGrip;
  };
  readonly z_overrides?: Readonly<Record<string, number>>;
  readonly off_grip_released_in?: readonly string[];
}

export interface WorkshopFrameManifest {
  readonly schema: string;
  readonly kit_id: string;
  readonly version: string;
  readonly family?: string;
  readonly status: string;
  /** Rig frame (640×640). Drawing surface may be larger via `stage`. */
  readonly canvas: readonly [number, number];
  /** v003.1+: 800×800 stage with rig translated by rig_origin. */
  readonly stage?: KitStage;
  readonly ground_y?: number;
  readonly root: { readonly asset: string; readonly position: readonly [number, number] };
  readonly paint_tokens: Readonly<Record<string, string>>;
  readonly paint_ids?: readonly string[];
  /** Per-weapon mount + z overrides (replaces v002 weapon_grip_rotation_degrees). */
  readonly weapons: Readonly<Record<KitWeaponKind, KitWeaponDef>>;
  readonly poses: Readonly<Record<string, KitPoseTable>>;
  readonly pose_format?: Readonly<Record<string, string>>;
  readonly pose_aliases?: Readonly<Record<string, string>>;
  /** A2 30 fps sequences per weapon (segments `{to, frames, ease}`). */
  readonly timing?: {
    readonly fps: number;
    readonly per_weapon: Readonly<
      Record<
        string,
        {
          readonly hit_stop_frames?: number;
          readonly attack_total_frames?: number;
          readonly walk_in?: readonly {
            readonly to: string;
            readonly frames: number;
            readonly ease: string;
            readonly note?: string;
          }[];
          readonly attack?: readonly {
            readonly to: string;
            readonly frames: number;
            readonly ease: string;
            readonly note?: string;
          }[];
          readonly dodge?: readonly {
            readonly to: string;
            readonly frames: number;
            readonly ease: string;
            readonly note?: string;
          }[];
          readonly hit_react?: readonly {
            readonly to: string;
            readonly frames: number;
            readonly ease: string;
            readonly note?: string;
          }[];
          readonly knockout?: readonly {
            readonly to: string;
            readonly frames: number;
            readonly ease: string;
            readonly note?: string;
          }[];
        }
      >
    >;
    readonly how_to_play?: string;
  };
  readonly assets: readonly KitAsset[];
  readonly integration: {
    readonly component?: string;
    readonly existing_props?: readonly string[];
    readonly mapping?: Readonly<Record<string, string>>;
    readonly status?: string;
    /** v002-only; absent on v003 — prefer `weapons`. */
    readonly paint_ids?: readonly string[];
    readonly weapon_ids?: readonly string[];
    readonly weapon_assets?: Readonly<Record<string, string>>;
  };
}
