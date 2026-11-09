import React from 'react';
import { Image, type StyleProp, type ImageStyle } from 'react-native';
import { uiKitAssets } from './assets';

export type BrandWordmarkProps = {
  variant?: 'dark' | 'light' | 'small';
  /** Logical width; height follows uniform aspect (516×142). */
  width?: number;
  style?: StyleProp<ImageStyle>;
  testID?: string;
};

/** BOTORE mechanical-O wordmark — uniform aspect only. */
export function BrandWordmark({
  variant = 'dark',
  width = 220,
  style,
  testID,
}: BrandWordmarkProps): React.ReactElement {
  const source =
    variant === 'light'
      ? uiKitAssets.wordmarkLight
      : variant === 'small'
        ? uiKitAssets.wordmarkSmall
        : uiKitAssets.wordmarkDark;
  const height = (width * 142) / 516;

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
