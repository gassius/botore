/**
 * Metro requires for kit-v003.3 attack smear tiles (fx/smears/*).
 * Paths match animation/clips.json `fx[].png`.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { ImageSourcePropType } from 'react-native';

const SMEAR_SOURCES: Readonly<Record<string, ImageSourcePropType>> = {
  'fx/smears/smear-sword-attack-15.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-sword-attack-15.png') as ImageSourcePropType,
  'fx/smears/smear-sword-attack-16.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-sword-attack-16.png') as ImageSourcePropType,
  'fx/smears/smear-sword-attack-17.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-sword-attack-17.png') as ImageSourcePropType,
  'fx/smears/smear-sword-attack-18.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-sword-attack-18.png') as ImageSourcePropType,
  'fx/smears/smear-axe-attack-18.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-axe-attack-18.png') as ImageSourcePropType,
  'fx/smears/smear-axe-attack-19.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-axe-attack-19.png') as ImageSourcePropType,
  'fx/smears/smear-axe-attack-26.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-axe-attack-26.png') as ImageSourcePropType,
  'fx/smears/smear-axe-attack-27.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-axe-attack-27.png') as ImageSourcePropType,
  'fx/smears/smear-axe-attack-28.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-axe-attack-28.png') as ImageSourcePropType,
  'fx/smears/smear-dagger-attack-08.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-dagger-attack-08.png') as ImageSourcePropType,
  'fx/smears/smear-dagger-attack-09.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-dagger-attack-09.png') as ImageSourcePropType,
  'fx/smears/smear-dagger-attack-10.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-dagger-attack-10.png') as ImageSourcePropType,
  'fx/smears/smear-dagger-attack-11.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-dagger-attack-11.png') as ImageSourcePropType,
  'fx/smears/smear-dagger-attack-12.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-dagger-attack-12.png') as ImageSourcePropType,
  'fx/smears/smear-dagger-attack-13.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-dagger-attack-13.png') as ImageSourcePropType,
  'fx/smears/smear-dagger-attack-14.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-dagger-attack-14.png') as ImageSourcePropType,
  'fx/smears/smear-dagger-attack-15.png':
    require('../../assets/workshop-frame-kit-v003/fx/smears/smear-dagger-attack-15.png') as ImageSourcePropType,
};

export function workshopFrameSmearSource(pngPath: string): ImageSourcePropType | undefined {
  return SMEAR_SOURCES[pngPath];
}
