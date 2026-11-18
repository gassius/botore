/** Auto-mapped Workshop Frame kit-v003 media for Metro require().
 * ACTIVE pin: v003.3. Do not mix with v002/v001 coordinates/assets.
 *
 * Includes precomposited parts/ (fallback/reference) plus materials/ + masks/
 * for under → mask-tint → over paint compositing. hand_*_wrap required.
 * E7: new weapons (mace/hammer/spear/shield) + A6 pattern fills.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { ImageSourcePropType } from 'react-native';
import { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION } from './workshopFramePin';

export { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION };

export const WORKSHOP_FRAME_PART_SOURCES: Record<string, ImageSourcePropType> = {
  'parts/foot_l-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/foot_l-oxide.png') as ImageSourcePropType,
  'parts/foot_l-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/foot_l-petrol.png') as ImageSourcePropType,
  'parts/foot_r-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/foot_r-oxide.png') as ImageSourcePropType,
  'parts/foot_r-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/foot_r-petrol.png') as ImageSourcePropType,
  'parts/forearm_l-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/forearm_l-oxide.png') as ImageSourcePropType,
  'parts/forearm_l-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/forearm_l-petrol.png') as ImageSourcePropType,
  'parts/forearm_r-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/forearm_r-oxide.png') as ImageSourcePropType,
  'parts/forearm_r-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/forearm_r-petrol.png') as ImageSourcePropType,
  'parts/hand_l-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/hand_l-oxide.png') as ImageSourcePropType,
  'parts/hand_l-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/hand_l-petrol.png') as ImageSourcePropType,
  'parts/hand_l_wrap-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/hand_l_wrap-oxide.png') as ImageSourcePropType,
  'parts/hand_l_wrap-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/hand_l_wrap-petrol.png') as ImageSourcePropType,
  'parts/hand_r-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/hand_r-oxide.png') as ImageSourcePropType,
  'parts/hand_r-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/hand_r-petrol.png') as ImageSourcePropType,
  'parts/hand_r_wrap-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/hand_r_wrap-oxide.png') as ImageSourcePropType,
  'parts/hand_r_wrap-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/hand_r_wrap-petrol.png') as ImageSourcePropType,
  'parts/head-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/head-oxide.png') as ImageSourcePropType,
  'parts/head-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/head-petrol.png') as ImageSourcePropType,
  'parts/pelvis-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/pelvis-oxide.png') as ImageSourcePropType,
  'parts/pelvis-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/pelvis-petrol.png') as ImageSourcePropType,
  'parts/shin_l-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/shin_l-oxide.png') as ImageSourcePropType,
  'parts/shin_l-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/shin_l-petrol.png') as ImageSourcePropType,
  'parts/shin_r-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/shin_r-oxide.png') as ImageSourcePropType,
  'parts/shin_r-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/shin_r-petrol.png') as ImageSourcePropType,
  'parts/thigh_l-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/thigh_l-oxide.png') as ImageSourcePropType,
  'parts/thigh_l-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/thigh_l-petrol.png') as ImageSourcePropType,
  'parts/thigh_r-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/thigh_r-oxide.png') as ImageSourcePropType,
  'parts/thigh_r-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/thigh_r-petrol.png') as ImageSourcePropType,
  'parts/torso-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/torso-oxide.png') as ImageSourcePropType,
  'parts/torso-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/torso-petrol.png') as ImageSourcePropType,
  'parts/upper_arm_l-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/upper_arm_l-oxide.png') as ImageSourcePropType,
  'parts/upper_arm_l-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/upper_arm_l-petrol.png') as ImageSourcePropType,
  'parts/upper_arm_r-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/upper_arm_r-oxide.png') as ImageSourcePropType,
  'parts/upper_arm_r-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/upper_arm_r-petrol.png') as ImageSourcePropType,
  'parts/weapon_axe-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_axe-oxide.png') as ImageSourcePropType,
  'parts/weapon_axe-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_axe-petrol.png') as ImageSourcePropType,
  'parts/weapon_dagger-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_dagger-oxide.png') as ImageSourcePropType,
  'parts/weapon_dagger-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_dagger-petrol.png') as ImageSourcePropType,
  'parts/weapon_sword-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_sword-oxide.png') as ImageSourcePropType,
  'parts/weapon_sword-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_sword-petrol.png') as ImageSourcePropType,
  'parts/weapon_mace-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_mace-oxide.png') as ImageSourcePropType,
  'parts/weapon_mace-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_mace-petrol.png') as ImageSourcePropType,
  'parts/weapon_hammer-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_hammer-oxide.png') as ImageSourcePropType,
  'parts/weapon_hammer-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_hammer-petrol.png') as ImageSourcePropType,
  'parts/weapon_spear-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_spear-oxide.png') as ImageSourcePropType,
  'parts/weapon_spear-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_spear-petrol.png') as ImageSourcePropType,
  'parts/weapon_shield-oxide.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_shield-oxide.png') as ImageSourcePropType,
  'parts/weapon_shield-petrol.png':
    require('../../assets/workshop-frame-kit-v003/parts/weapon_shield-petrol.png') as ImageSourcePropType,
  'masks/foot_l-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/foot_l-paint.png') as ImageSourcePropType,
  'masks/foot_r-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/foot_r-paint.png') as ImageSourcePropType,
  'masks/forearm_l-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/forearm_l-paint.png') as ImageSourcePropType,
  'masks/forearm_r-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/forearm_r-paint.png') as ImageSourcePropType,
  'masks/hand_l-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/hand_l-paint.png') as ImageSourcePropType,
  'masks/hand_l_wrap-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/hand_l_wrap-paint.png') as ImageSourcePropType,
  'masks/hand_r-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/hand_r-paint.png') as ImageSourcePropType,
  'masks/hand_r_wrap-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/hand_r_wrap-paint.png') as ImageSourcePropType,
  'masks/head-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/head-paint.png') as ImageSourcePropType,
  'masks/pelvis-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/pelvis-paint.png') as ImageSourcePropType,
  'masks/shin_l-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/shin_l-paint.png') as ImageSourcePropType,
  'masks/shin_r-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/shin_r-paint.png') as ImageSourcePropType,
  'masks/thigh_l-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/thigh_l-paint.png') as ImageSourcePropType,
  'masks/thigh_r-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/thigh_r-paint.png') as ImageSourcePropType,
  'masks/torso-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/torso-paint.png') as ImageSourcePropType,
  'masks/upper_arm_l-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/upper_arm_l-paint.png') as ImageSourcePropType,
  'masks/upper_arm_r-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/upper_arm_r-paint.png') as ImageSourcePropType,
  'masks/weapon_axe-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/weapon_axe-paint.png') as ImageSourcePropType,
  'masks/weapon_dagger-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/weapon_dagger-paint.png') as ImageSourcePropType,
  'masks/weapon_hammer-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/weapon_hammer-paint.png') as ImageSourcePropType,
  'masks/weapon_mace-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/weapon_mace-paint.png') as ImageSourcePropType,
  'masks/weapon_shield-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/weapon_shield-paint.png') as ImageSourcePropType,
  'masks/weapon_spear-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/weapon_spear-paint.png') as ImageSourcePropType,
  'masks/weapon_sword-paint.png':
    require('../../assets/workshop-frame-kit-v003/masks/weapon_sword-paint.png') as ImageSourcePropType,
  'materials/foot_l-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/foot_l-over.png') as ImageSourcePropType,
  'materials/foot_l-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/foot_l-under.png') as ImageSourcePropType,
  'materials/foot_r-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/foot_r-over.png') as ImageSourcePropType,
  'materials/foot_r-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/foot_r-under.png') as ImageSourcePropType,
  'materials/forearm_l-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/forearm_l-over.png') as ImageSourcePropType,
  'materials/forearm_l-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/forearm_l-under.png') as ImageSourcePropType,
  'materials/forearm_r-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/forearm_r-over.png') as ImageSourcePropType,
  'materials/forearm_r-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/forearm_r-under.png') as ImageSourcePropType,
  'materials/hand_l-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/hand_l-over.png') as ImageSourcePropType,
  'materials/hand_l-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/hand_l-under.png') as ImageSourcePropType,
  'materials/hand_l_wrap-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/hand_l_wrap-over.png') as ImageSourcePropType,
  'materials/hand_l_wrap-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/hand_l_wrap-under.png') as ImageSourcePropType,
  'materials/hand_r-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/hand_r-over.png') as ImageSourcePropType,
  'materials/hand_r-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/hand_r-under.png') as ImageSourcePropType,
  'materials/hand_r_wrap-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/hand_r_wrap-over.png') as ImageSourcePropType,
  'materials/hand_r_wrap-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/hand_r_wrap-under.png') as ImageSourcePropType,
  'materials/head-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/head-over.png') as ImageSourcePropType,
  'materials/head-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/head-under.png') as ImageSourcePropType,
  'materials/pelvis-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/pelvis-over.png') as ImageSourcePropType,
  'materials/pelvis-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/pelvis-under.png') as ImageSourcePropType,
  'materials/shin_l-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/shin_l-over.png') as ImageSourcePropType,
  'materials/shin_l-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/shin_l-under.png') as ImageSourcePropType,
  'materials/shin_r-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/shin_r-over.png') as ImageSourcePropType,
  'materials/shin_r-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/shin_r-under.png') as ImageSourcePropType,
  'materials/thigh_l-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/thigh_l-over.png') as ImageSourcePropType,
  'materials/thigh_l-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/thigh_l-under.png') as ImageSourcePropType,
  'materials/thigh_r-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/thigh_r-over.png') as ImageSourcePropType,
  'materials/thigh_r-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/thigh_r-under.png') as ImageSourcePropType,
  'materials/torso-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/torso-over.png') as ImageSourcePropType,
  'materials/torso-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/torso-under.png') as ImageSourcePropType,
  'materials/upper_arm_l-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/upper_arm_l-over.png') as ImageSourcePropType,
  'materials/upper_arm_l-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/upper_arm_l-under.png') as ImageSourcePropType,
  'materials/upper_arm_r-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/upper_arm_r-over.png') as ImageSourcePropType,
  'materials/upper_arm_r-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/upper_arm_r-under.png') as ImageSourcePropType,
  'materials/weapon_axe-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_axe-over.png') as ImageSourcePropType,
  'materials/weapon_axe-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_axe-under.png') as ImageSourcePropType,
  'materials/weapon_dagger-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_dagger-over.png') as ImageSourcePropType,
  'materials/weapon_dagger-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_dagger-under.png') as ImageSourcePropType,
  'materials/weapon_hammer-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_hammer-over.png') as ImageSourcePropType,
  'materials/weapon_hammer-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_hammer-under.png') as ImageSourcePropType,
  'materials/weapon_mace-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_mace-over.png') as ImageSourcePropType,
  'materials/weapon_mace-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_mace-under.png') as ImageSourcePropType,
  'materials/weapon_shield-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_shield-over.png') as ImageSourcePropType,
  'materials/weapon_shield-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_shield-under.png') as ImageSourcePropType,
  'materials/weapon_spear-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_spear-over.png') as ImageSourcePropType,
  'materials/weapon_spear-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_spear-under.png') as ImageSourcePropType,
  'materials/weapon_sword-over.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_sword-over.png') as ImageSourcePropType,
  'materials/weapon_sword-under.png':
    require('../../assets/workshop-frame-kit-v003/materials/weapon_sword-under.png') as ImageSourcePropType,
  'a6-paints-v4/pattern-fills/hazard/head.png':
    require('../../assets/a6-paints-v4/pattern-fills/hazard/head.png') as ImageSourcePropType,
  'a6-paints-v4/pattern-fills/hazard/torso.png':
    require('../../assets/a6-paints-v4/pattern-fills/hazard/torso.png') as ImageSourcePropType,
  'a6-paints-v4/pattern-fills/hazard/thigh_l.png':
    require('../../assets/a6-paints-v4/pattern-fills/hazard/thigh_l.png') as ImageSourcePropType,
  'a6-paints-v4/pattern-fills/hazard/thigh_r.png':
    require('../../assets/a6-paints-v4/pattern-fills/hazard/thigh_r.png') as ImageSourcePropType,
  'a6-paints-v4/pattern-fills/hazard/weapon_shield.png':
    require('../../assets/a6-paints-v4/pattern-fills/hazard/weapon_shield.png') as ImageSourcePropType,
  'a6-paints-v4/pattern-fills/racing/head.png':
    require('../../assets/a6-paints-v4/pattern-fills/racing/head.png') as ImageSourcePropType,
  'a6-paints-v4/pattern-fills/racing/torso.png':
    require('../../assets/a6-paints-v4/pattern-fills/racing/torso.png') as ImageSourcePropType,
  'a6-paints-v4/pattern-fills/racing/thigh_l.png':
    require('../../assets/a6-paints-v4/pattern-fills/racing/thigh_l.png') as ImageSourcePropType,
  'a6-paints-v4/pattern-fills/racing/thigh_r.png':
    require('../../assets/a6-paints-v4/pattern-fills/racing/thigh_r.png') as ImageSourcePropType,
  'a6-paints-v4/pattern-fills/racing/weapon_shield.png':
    require('../../assets/a6-paints-v4/pattern-fills/racing/weapon_shield.png') as ImageSourcePropType,
};

export function workshopFramePartSource(relPath: string): ImageSourcePropType | undefined {
  return WORKSHOP_FRAME_PART_SOURCES[relPath];
}
