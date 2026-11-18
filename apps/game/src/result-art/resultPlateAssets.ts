/**
 * Metro requires for kit-v003 result plates (PNG 1x/2x/3x).
 * Runtime picks density; SVG under assets/result-plates/svg is reference only.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import { PixelRatio, type ImageSourcePropType } from 'react-native';
import { resultPlateDensityBucket, type ResultPlateKind } from './resultPlateSpec';

const VICTORY_SOURCES = {
  1: require('../../assets/result-plates/png/1x/victory.png') as ImageSourcePropType,
  2: require('../../assets/result-plates/png/2x/victory.png') as ImageSourcePropType,
  3: require('../../assets/result-plates/png/3x/victory.png') as ImageSourcePropType,
} as const;

const DEFEAT_SOURCES = {
  1: require('../../assets/result-plates/png/1x/defeat.png') as ImageSourcePropType,
  2: require('../../assets/result-plates/png/2x/defeat.png') as ImageSourcePropType,
  3: require('../../assets/result-plates/png/3x/defeat.png') as ImageSourcePropType,
} as const;

const NEW_RECORD_SOURCES = {
  1: require('../../assets/result-plates/png/1x/new-record.png') as ImageSourcePropType,
  2: require('../../assets/result-plates/png/2x/new-record.png') as ImageSourcePropType,
  3: require('../../assets/result-plates/png/3x/new-record.png') as ImageSourcePropType,
} as const;

const BY_KIND = {
  victory: VICTORY_SOURCES,
  defeat: DEFEAT_SOURCES,
  new_record: NEW_RECORD_SOURCES,
} as const;

export function resultPlateSource(
  kind: ResultPlateKind,
  pixelRatio: number = PixelRatio.get(),
): ImageSourcePropType {
  const bucket = resultPlateDensityBucket(pixelRatio);
  return BY_KIND[kind][bucket];
}
