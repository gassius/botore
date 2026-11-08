/** Environment-v001 manifest + sealed hashes (headless-safe). */
import { ACTIVE_ENVIRONMENT_ASSET_VERSION } from './environmentPin';
import manifestJson from '../../assets/environment-v001/manifest.json';

export { ACTIVE_ENVIRONMENT_ASSET_VERSION };

export const ENVIRONMENT_MANIFEST = manifestJson as unknown as {
  readonly version: string;
  readonly id: string;
  readonly canvas: readonly [number, number];
  readonly layers: Record<string, number>;
  readonly illustrative_start_actors: readonly SceneActorSpec[];
  readonly fx: {
    readonly reduced_motion: string;
    readonly spawn: string;
  };
};

export interface SceneActorSpec {
  readonly id: string;
  readonly paintId: string;
  readonly weaponId: string;
  readonly facing: string;
  readonly scale: number;
  readonly ground_anchor: readonly [number, number];
  readonly local_ground_anchor: readonly [number, number];
  readonly layer: number;
  readonly contact_shadow: {
    readonly asset_id: string;
    readonly position: readonly [number, number];
    readonly scale: readonly [number, number];
    readonly pivot: readonly [number, number];
  };
  readonly origin_of_kit_canvas: readonly [number, number];
}

if (ENVIRONMENT_MANIFEST.version !== ACTIVE_ENVIRONMENT_ASSET_VERSION) {
  throw new Error(
    `environment pin mismatch: expected ${ACTIVE_ENVIRONMENT_ASSET_VERSION}, got ${ENVIRONMENT_MANIFEST.version}`,
  );
}

export const ENVIRONMENT_FX_META = {
  hit: { width: 192, height: 192, pivot: [96, 96] as const },
  dodge: { width: 224, height: 112, pivot: [112, 80] as const },
  defeat: { width: 256, height: 128, pivot: [128, 96] as const },
} as const;

/** Sealed PNG + manifest hashes from environment-v001 SHA256SUMS (runtime subset). */
export const ENVIRONMENT_SEALED_SHA256 = {
  'manifest.json': '199d01a4cb5bc78c02a4837aef927424f9befe6dbb7c2c1047cec6af58ff49b5',
  'background/repair-yard-wall.png':
    'fc444669b689791cb4f227c0624656bb7be32db2d0a1647a474c0b479bed4b05',
  'background/repair-yard-floor.png':
    'b4a25de33cdca8d7fa2404bc1ef4fa4b07a56b47ca5702d2495c80d8766cd3d1',
  'background/repair-yard-floor-markings.png':
    'e593fc65e790f63bce319e74ca27a2a0ab62bfe5b436ae1c71799a2b8b7cf7ef',
  'background/contact-shadow.png':
    '314f66a3e4fa03c7949c3513a9bc5d45db38dd487b7e7a8c6ddea39cf293d09c',
  'fx/hit-spark-00.png': '16d44de900ffdba183f9e9a030519d1d8adaf4e90ff2f53a1540743e36d1d988',
  'fx/hit-spark-01.png': 'f2b4baa9c78790e802b96a310163e7f2e77d1b6f485eba8cb9492847bcda7dca',
  'fx/hit-spark-02.png': 'e34caf6f2763f0fe03e8d60e670a83bf6ad1c690f89d09bb862a78b0a7c95257',
  'fx/dodge-dust-00.png': '14fe77067c300d82d34e3b867c5ae8c47a14598e2131ab3738417f354ac5ba8c',
  'fx/dodge-dust-01.png': '8c6ba9ab2da8ae900d26631360890d022afa5892c039ce573ba919897b8f9193',
  'fx/dodge-dust-02.png': '9466d68e38c35eecbb2efedffd777248dfd00821966074cdecf29a97168a1eee',
  'fx/defeat-dust-00.png': '50ab6e31ff308e80dedd5d81229e136cee78a030202ddfdabd130a9bdc229926',
  'fx/defeat-dust-01.png': '135e27d72beffcf97dd326e880bf3bf9a204030c7842166d20ed6acc239cb47a',
  'fx/defeat-dust-02.png': 'f86ff076c8cab65626c74a2184c5958b79a466369f3c23078f122135c29e29e2',
} as const;
