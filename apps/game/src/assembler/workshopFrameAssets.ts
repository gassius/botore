/** Auto-mapped Workshop Frame kit-v002 media for Metro require().
 * ACTIVE pin: v002 only. Do not mix with v001 coordinates/assets.
 *
 * Includes precomposited parts/ (fallback/reference) plus materials/ + masks/
 * for under → mask-tint → over paint compositing (C2).
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

  'masks/foot_l-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/foot_l-paint.png') as ImageSourcePropType,
  'masks/foot_r-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/foot_r-paint.png') as ImageSourcePropType,
  'masks/forearm_l-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/forearm_l-paint.png') as ImageSourcePropType,
  'masks/forearm_r-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/forearm_r-paint.png') as ImageSourcePropType,
  'masks/hand_l-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/hand_l-paint.png') as ImageSourcePropType,
  'masks/hand_r-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/hand_r-paint.png') as ImageSourcePropType,
  'masks/head-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/head-paint.png') as ImageSourcePropType,
  'masks/pelvis-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/pelvis-paint.png') as ImageSourcePropType,
  'masks/shin_l-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/shin_l-paint.png') as ImageSourcePropType,
  'masks/shin_r-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/shin_r-paint.png') as ImageSourcePropType,
  'masks/thigh_l-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/thigh_l-paint.png') as ImageSourcePropType,
  'masks/thigh_r-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/thigh_r-paint.png') as ImageSourcePropType,
  'masks/torso-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/torso-paint.png') as ImageSourcePropType,
  'masks/upper_arm_l-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/upper_arm_l-paint.png') as ImageSourcePropType,
  'masks/upper_arm_r-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/upper_arm_r-paint.png') as ImageSourcePropType,
  'masks/weapon_axe-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/weapon_axe-paint.png') as ImageSourcePropType,
  'masks/weapon_dagger-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/weapon_dagger-paint.png') as ImageSourcePropType,
  'masks/weapon_sword-paint.png':
    require('../../assets/workshop-frame-kit-v002/masks/weapon_sword-paint.png') as ImageSourcePropType,

  'materials/foot_l-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/foot_l-over.png') as ImageSourcePropType,
  'materials/foot_l-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/foot_l-under.png') as ImageSourcePropType,
  'materials/foot_r-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/foot_r-over.png') as ImageSourcePropType,
  'materials/foot_r-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/foot_r-under.png') as ImageSourcePropType,
  'materials/forearm_l-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/forearm_l-over.png') as ImageSourcePropType,
  'materials/forearm_l-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/forearm_l-under.png') as ImageSourcePropType,
  'materials/forearm_r-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/forearm_r-over.png') as ImageSourcePropType,
  'materials/forearm_r-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/forearm_r-under.png') as ImageSourcePropType,
  'materials/hand_l-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/hand_l-over.png') as ImageSourcePropType,
  'materials/hand_l-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/hand_l-under.png') as ImageSourcePropType,
  'materials/hand_r-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/hand_r-over.png') as ImageSourcePropType,
  'materials/hand_r-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/hand_r-under.png') as ImageSourcePropType,
  'materials/head-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/head-over.png') as ImageSourcePropType,
  'materials/head-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/head-under.png') as ImageSourcePropType,
  'materials/pelvis-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/pelvis-over.png') as ImageSourcePropType,
  'materials/pelvis-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/pelvis-under.png') as ImageSourcePropType,
  'materials/shin_l-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/shin_l-over.png') as ImageSourcePropType,
  'materials/shin_l-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/shin_l-under.png') as ImageSourcePropType,
  'materials/shin_r-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/shin_r-over.png') as ImageSourcePropType,
  'materials/shin_r-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/shin_r-under.png') as ImageSourcePropType,
  'materials/thigh_l-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/thigh_l-over.png') as ImageSourcePropType,
  'materials/thigh_l-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/thigh_l-under.png') as ImageSourcePropType,
  'materials/thigh_r-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/thigh_r-over.png') as ImageSourcePropType,
  'materials/thigh_r-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/thigh_r-under.png') as ImageSourcePropType,
  'materials/torso-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/torso-over.png') as ImageSourcePropType,
  'materials/torso-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/torso-under.png') as ImageSourcePropType,
  'materials/upper_arm_l-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/upper_arm_l-over.png') as ImageSourcePropType,
  'materials/upper_arm_l-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/upper_arm_l-under.png') as ImageSourcePropType,
  'materials/upper_arm_r-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/upper_arm_r-over.png') as ImageSourcePropType,
  'materials/upper_arm_r-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/upper_arm_r-under.png') as ImageSourcePropType,
  'materials/weapon_axe-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/weapon_axe-over.png') as ImageSourcePropType,
  'materials/weapon_axe-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/weapon_axe-under.png') as ImageSourcePropType,
  'materials/weapon_dagger-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/weapon_dagger-over.png') as ImageSourcePropType,
  'materials/weapon_dagger-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/weapon_dagger-under.png') as ImageSourcePropType,
  'materials/weapon_sword-over.png':
    require('../../assets/workshop-frame-kit-v002/materials/weapon_sword-over.png') as ImageSourcePropType,
  'materials/weapon_sword-under.png':
    require('../../assets/workshop-frame-kit-v002/materials/weapon_sword-under.png') as ImageSourcePropType,
};

export function workshopFramePartSource(relPath: string): ImageSourcePropType | undefined {
  return WORKSHOP_FRAME_PART_SOURCES[relPath];
}
