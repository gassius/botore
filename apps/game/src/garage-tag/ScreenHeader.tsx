import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { garageTag } from './tokens';
import { uiKitAssets } from './assets';
import { GlyphButton } from './GlyphButton';

export type ScreenHeaderProps = {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  testID?: string;
};

export function ScreenHeader({
  title,
  onBack,
  right,
  testID,
}: ScreenHeaderProps): React.ReactElement {
  return (
    <View style={styles.row} testID={testID}>
      {onBack ? (
        <GlyphButton
          source={uiKitAssets.glyphBack}
          accessibilityLabel="Back"
          onPress={onBack}
          {...(testID ? { testID: `${testID}-back` } : {})}
        />
      ) : (
        <View style={styles.spacer} />
      )}
      <Text style={styles.title} numberOfLines={2} allowFontScaling>
        — {title} —
      </Text>
      {right ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: garageTag.touchMin,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  spacer: {
    width: garageTag.touchMin,
    height: garageTag.touchMin,
  },
});
