import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { TITLE_SILHOUETTE_ASPECT, uiKitAssets } from './assets';
import { garageTag } from './tokens';

export type InAppTitleSplashProps = {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * When true, fills the parent and covers with the silhouette composite
   * (contain, bottom-centred per launch-v001 title notes).
   */
  fill?: boolean;
};

/**
 * In-app atmospheric title — silhouette composite from launch-v001 (REF-01).
 * Native platform splash stays in app.json / expo-splash-screen; this is the
 * richer JS-layer intro, not web acceptance evidence.
 */
export function InAppTitleSplash({
  style,
  testID = 'in-app-title-splash',
  fill = true,
}: InAppTitleSplashProps): React.ReactElement {
  return (
    <View
      style={[styles.root, fill ? styles.fill : null, style]}
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel="Botore"
    >
      <Image
        source={uiKitAssets.titleSilhouette}
        style={styles.image}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: garageTag.graphite,
    overflow: 'hidden',
    aspectRatio: TITLE_SILHOUETTE_ASPECT.width / TITLE_SILHOUETTE_ASPECT.height,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    aspectRatio: undefined,
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
