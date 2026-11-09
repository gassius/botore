/** Subset of kit-v002 manifest used by the F7 adapter (not a competing public API). */

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

export interface KitPoseDeltas {
  readonly root_angle?: number;
  readonly root_x?: number;
  readonly root_y?: number;
  readonly [jointId: string]: number | undefined;
}

export interface WorkshopFrameManifest {
  readonly schema: string;
  readonly kit_id: string;
  readonly version: string;
  readonly status: string;
  readonly canvas: readonly [number, number];
  readonly root: { readonly asset: string; readonly position: readonly [number, number] };
  readonly paint_tokens: Readonly<Record<KitPaintId, string>>;
  readonly weapon_grip_rotation_degrees: number;
  readonly poses: Readonly<Record<string, KitPoseDeltas>>;
  readonly assets: readonly KitAsset[];
  readonly integration: {
    readonly paint_ids: readonly string[];
    readonly weapon_ids: readonly string[];
    readonly weapon_assets: Readonly<Record<string, string>>;
  };
}
