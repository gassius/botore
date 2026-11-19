/**
 * A4 shape picker card art: one signature tile per option (oxide, 1x).
 * Static imports (not require) so the picker stays loadable under vitest.
 */
import type { ImageSourcePropType } from 'react-native';
import type { ShapeAlias, ShapeSlot } from '../../assembler/shapes';
import headStock from '../../../assets/workshop-frame-kit-v003/parts/head-oxide.png';
import torsoStock from '../../../assets/workshop-frame-kit-v003/parts/torso-oxide.png';
import forearmStock from '../../../assets/workshop-frame-kit-v003/parts/forearm_r-oxide.png';
import shinStock from '../../../assets/workshop-frame-kit-v003/parts/shin_r-oxide.png';
import headWelder from '../../../assets/a4-shapes-v2.1/parts/1x/head-welder/oxide.png';
import headCan from '../../../assets/a4-shapes-v2.1/parts/1x/head-can/oxide.png';
import torsoBoiler from '../../../assets/a4-shapes-v2.1/parts/1x/torso-boiler/oxide.png';
import torsoSlab from '../../../assets/a4-shapes-v2.1/parts/1x/torso-slab/oxide.png';
import forearmHeavy from '../../../assets/a4-shapes-v2.1/parts/1x/forearm-heavy/oxide.png';
import shinPiston from '../../../assets/a4-shapes-v2.1/parts/1x/shin-piston/oxide.png';

const SHAPE_THUMBNAILS: {
  readonly [S in ShapeSlot]: Readonly<Record<ShapeAlias<S>, ImageSourcePropType>>;
} = {
  head: { visor: headStock, welder: headWelder, can: headCan },
  body: { chassis: torsoStock, boiler: torsoBoiler, slab: torsoSlab },
  arms: { stock: forearmStock, heavy: forearmHeavy },
  legs: { stock: shinStock, piston: shinPiston },
};

export function shapeThumbnailSource<S extends ShapeSlot>(
  slot: S,
  alias: ShapeAlias<S>,
): ImageSourcePropType {
  return SHAPE_THUMBNAILS[slot][alias];
}
