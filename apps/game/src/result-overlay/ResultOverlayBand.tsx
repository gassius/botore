/**
 * D2 bottom band — Back to Stable / Watch again / Ranking.
 * Same functions as the retired Fight Result footer.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { garageTag, uiKitAssets } from '../garage-tag';

export type ResultOverlayBandProps = {
  readonly onBackToStable: () => void;
  readonly onWatchAgain: () => void;
  readonly onRanking: () => void;
  readonly testID?: string;
};

export function ResultOverlayBand({
  onBackToStable,
  onWatchAgain,
  onRanking,
  testID = 'result-overlay-band',
}: ResultOverlayBandProps): React.ReactElement {
  return (
    <View style={styles.band} testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Stable"
        onPress={onBackToStable}
        style={({ pressed }) => [styles.primary, pressed ? styles.primaryPressed : null]}
        testID="result-stable"
      >
        <Text style={styles.primaryLabel} allowFontScaling>
          Back to Stable
        </Text>
      </Pressable>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Watch again"
          onPress={onWatchAgain}
          style={({ pressed }) => [
            styles.secondary,
            styles.half,
            pressed ? styles.secondaryPressed : null,
          ]}
          testID="result-watch"
        >
          <Image
            source={uiKitAssets.glyphReplay}
            style={styles.glyph}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.secondaryLabel} allowFontScaling>
            Watch again
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ranking"
          onPress={onRanking}
          style={({ pressed }) => [
            styles.secondary,
            styles.half,
            pressed ? styles.secondaryPressed : null,
          ]}
          testID="result-ranking"
        >
          <Text style={styles.secondaryLabel} allowFontScaling>
            Ranking
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: garageTag.cream,
    borderTopWidth: 4,
    borderTopColor: garageTag.graphite,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 12,
  },
  primary: {
    minHeight: 52,
    backgroundColor: garageTag.mustard,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: garageTag.graphite,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  primaryPressed: {
    backgroundColor: garageTag.mustardPressed,
  },
  primaryLabel: {
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.6,
    color: garageTag.graphite,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  secondary: {
    minHeight: 48,
    backgroundColor: garageTag.cream,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  secondaryPressed: {
    backgroundColor: garageTag.paper,
  },
  secondaryLabel: {
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.4,
    color: garageTag.graphite,
  },
  glyph: {
    width: 18,
    height: 18,
  },
});
