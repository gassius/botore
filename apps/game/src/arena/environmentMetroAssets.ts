/** Metro requires for environment-v001 PNGs. UI-only — keep out of headless tests. */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { ImageSourcePropType } from 'react-native';

export const ENVIRONMENT_BACKGROUND_SOURCES = {
  wall: require('../../assets/environment-v001/background/repair-yard-wall.png') as ImageSourcePropType,
  floor:
    require('../../assets/environment-v001/background/repair-yard-floor.png') as ImageSourcePropType,
  markings:
    require('../../assets/environment-v001/background/repair-yard-floor-markings.png') as ImageSourcePropType,
  contactShadow:
    require('../../assets/environment-v001/background/contact-shadow.png') as ImageSourcePropType,
} as const;

export const ENVIRONMENT_FX_SOURCES = {
  hit: [
    require('../../assets/environment-v001/fx/hit-spark-00.png') as ImageSourcePropType,
    require('../../assets/environment-v001/fx/hit-spark-01.png') as ImageSourcePropType,
    require('../../assets/environment-v001/fx/hit-spark-02.png') as ImageSourcePropType,
  ],
  dodge: [
    require('../../assets/environment-v001/fx/dodge-dust-00.png') as ImageSourcePropType,
    require('../../assets/environment-v001/fx/dodge-dust-01.png') as ImageSourcePropType,
    require('../../assets/environment-v001/fx/dodge-dust-02.png') as ImageSourcePropType,
  ],
  defeat: [
    require('../../assets/environment-v001/fx/defeat-dust-00.png') as ImageSourcePropType,
    require('../../assets/environment-v001/fx/defeat-dust-01.png') as ImageSourcePropType,
    require('../../assets/environment-v001/fx/defeat-dust-02.png') as ImageSourcePropType,
  ],
} as const;
