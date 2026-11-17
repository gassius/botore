/** Subset of kit-v003 manifest used by the F7 adapter (not a competing public API). */

export type KitPaintId = 'oxide' | 'petrol';
export type KitWeaponKind = 'sword' | 'axe' | 'dagger';

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
  /** Precomposited Oxide/Petrol fallback renders (reference / offline). */
  readonly files: Readonly<Record<KitPaintId, string>>;
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
  readonly canvas: readonly [number, number];
  readonly ground_y?: number;
  readonly root: { readonly asset: string; readonly position: readonly [number, number] };
  readonly paint_tokens: Readonly<Record<KitPaintId, string>>;
  readonly paint_ids?: readonly string[];
  /** Per-weapon mount + z overrides (replaces v002 weapon_grip_rotation_degrees). */
  readonly weapons: Readonly<Record<KitWeaponKind, KitWeaponDef>>;
  readonly poses: Readonly<Record<string, KitPoseTable>>;
  readonly pose_format?: Readonly<Record<string, string>>;
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
