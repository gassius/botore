/** Auto-mapped Workshop Frame kit-v002 precomposited part PNGs for Metro require().
 * ACTIVE pin: v002 only. Do not mix with v001 coordinates/assets.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { ImageSourcePropType } from 'react-native';
import { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION } from './workshopFramePin';

export { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION };

export const WORKSHOP_FRAME_PART_SOURCES: Record<string, ImageSourcePropType> = {
  'parts/foot_l-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/foot_l-oxide.png') as ImageSourcePropType,
  'parts/foot_l-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/foot_l-petrol.png') as ImageSourcePropType,
  'parts/foot_r-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/foot_r-oxide.png') as ImageSourcePropType,
  'parts/foot_r-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/foot_r-petrol.png') as ImageSourcePropType,
  'parts/forearm_l-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/forearm_l-oxide.png') as ImageSourcePropType,
  'parts/forearm_l-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/forearm_l-petrol.png') as ImageSourcePropType,
  'parts/forearm_r-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/forearm_r-oxide.png') as ImageSourcePropType,
  'parts/forearm_r-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/forearm_r-petrol.png') as ImageSourcePropType,
  'parts/hand_l-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/hand_l-oxide.png') as ImageSourcePropType,
  'parts/hand_l-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/hand_l-petrol.png') as ImageSourcePropType,
  'parts/hand_r-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/hand_r-oxide.png') as ImageSourcePropType,
  'parts/hand_r-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/hand_r-petrol.png') as ImageSourcePropType,
  'parts/head-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/head-oxide.png') as ImageSourcePropType,
  'parts/head-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/head-petrol.png') as ImageSourcePropType,
  'parts/pelvis-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/pelvis-oxide.png') as ImageSourcePropType,
  'parts/pelvis-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/pelvis-petrol.png') as ImageSourcePropType,
  'parts/shin_l-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/shin_l-oxide.png') as ImageSourcePropType,
  'parts/shin_l-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/shin_l-petrol.png') as ImageSourcePropType,
  'parts/shin_r-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/shin_r-oxide.png') as ImageSourcePropType,
  'parts/shin_r-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/shin_r-petrol.png') as ImageSourcePropType,
  'parts/thigh_l-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/thigh_l-oxide.png') as ImageSourcePropType,
  'parts/thigh_l-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/thigh_l-petrol.png') as ImageSourcePropType,
  'parts/thigh_r-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/thigh_r-oxide.png') as ImageSourcePropType,
  'parts/thigh_r-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/thigh_r-petrol.png') as ImageSourcePropType,
  'parts/torso-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/torso-oxide.png') as ImageSourcePropType,
  'parts/torso-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/torso-petrol.png') as ImageSourcePropType,
  'parts/upper_arm_l-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/upper_arm_l-oxide.png') as ImageSourcePropType,
  'parts/upper_arm_l-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/upper_arm_l-petrol.png') as ImageSourcePropType,
  'parts/upper_arm_r-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/upper_arm_r-oxide.png') as ImageSourcePropType,
  'parts/upper_arm_r-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/upper_arm_r-petrol.png') as ImageSourcePropType,
  'parts/weapon_axe-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/weapon_axe-oxide.png') as ImageSourcePropType,
  'parts/weapon_axe-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/weapon_axe-petrol.png') as ImageSourcePropType,
  'parts/weapon_dagger-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/weapon_dagger-oxide.png') as ImageSourcePropType,
  'parts/weapon_dagger-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/weapon_dagger-petrol.png') as ImageSourcePropType,
  'parts/weapon_sword-oxide.png':
    require('../../assets/workshop-frame-kit-v002/parts/weapon_sword-oxide.png') as ImageSourcePropType,
  'parts/weapon_sword-petrol.png':
    require('../../assets/workshop-frame-kit-v002/parts/weapon_sword-petrol.png') as ImageSourcePropType,
};

export function workshopFramePartSource(relPath: string): ImageSourcePropType | undefined {
  return WORKSHOP_FRAME_PART_SOURCES[relPath];
}
