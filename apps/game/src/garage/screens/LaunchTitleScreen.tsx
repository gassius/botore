import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { garageTag, uiKitAssets } from '../../garage-tag';

/**
 * In-app title silhouette composite (same launch-static art as the native splash).
 * Held during design-capture cold-start so CI can record splash → title, not AuthEntry.
 */
export function LaunchTitleScreen(): React.ReactElement {
  return (
    <View style={styles.root} testID="launch-title">
      <Image
        source={uiKitAssets.launchStatic}
        style={styles.mark}
        resizeMode="contain"
        accessibilityLabel="Botore"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: garageTag.graphite,
  },
  mark: {
    width: '78%',
    height: '78%',
  },
});
