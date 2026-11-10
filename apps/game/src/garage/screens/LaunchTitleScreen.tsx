import React from 'react';
import { StyleSheet, View } from 'react-native';
import { garageTag, InAppTitleSplash } from '../../garage-tag';

export type LaunchTitleScreenProps = {
  /** Release native splash once the silhouette is ready to paint. */
  onImageLoad?: () => void;
  onImageError?: () => void;
};

/**
 * In-app title silhouette held during design-capture cold-start so CI can
 * record native splash → launch-v001 title (not AuthEntry).
 * Reuses C6 InAppTitleSplash / uiKitAssets.titleSilhouette.
 */
export function LaunchTitleScreen({
  onImageLoad,
  onImageError,
}: LaunchTitleScreenProps = {}): React.ReactElement {
  return (
    <View style={styles.root} testID="launch-title">
      <InAppTitleSplash
        testID="launch-title-splash"
        {...(onImageLoad ? { onImageLoad } : {})}
        {...(onImageError ? { onImageError } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: garageTag.graphite,
  },
});
