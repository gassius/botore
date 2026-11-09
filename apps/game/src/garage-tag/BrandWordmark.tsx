import React from 'react';
import { Image, type StyleProp, type ImageStyle } from 'react-native';
import { BRAND_WORDMARK_ASPECT, uiKitAssets } from './assets';

export type BrandWordmarkProps = {
  variant?: 'dark' | 'light' | 'small' | 'small-light';
  /** Logical width; height follows uniform launch-v001 aspect (2400×558). */
  width?: number;
  style?: StyleProp<ImageStyle>;
  testID?: string;
};

/** BOTORE mechanical-O wordmark (launch-v001) — uniform aspect only. */
export function BrandWordmark({
  variant = 'dark',
  width = 220,
  style,
  testID,
}: BrandWordmarkProps): React.ReactElement {
  const source =
    variant === 'light'
      ? uiKitAssets.wordmarkLight
      : variant === 'small-light'
        ? uiKitAssets.wordmarkSmallLight
        : variant === 'small'
          ? uiKitAssets.wordmarkSmall
          : uiKitAssets.wordmarkDark;
  const height = (width * BRAND_WORDMARK_ASPECT.height) / BRAND_WORDMARK_ASPECT.width;

  return (
    <Image
      source={source}
      style={[{ width, height }, style]}
      resizeMode="contain"
      accessibilityLabel="Botore"
      accessibilityRole="image"
      testID={testID}
      accessibilityIgnoresInvertColors
    />
  );
}
