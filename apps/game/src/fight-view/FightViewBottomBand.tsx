/**
 * Bottom band under the arena: optional event call-out + arena name (first watch),
 * or a single REPLAY button (rewatch). Never shows scrubber / pause / Continue / Mute.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { garageTag, uiKitAssets } from '../garage-tag';
import type { FightViewCallout, FightViewMode } from './types';
import { FIGHT_VIEW_ARENA_NAME } from './types';

export type FightViewBottomBandProps = {
  readonly mode: FightViewMode;
  readonly callout: FightViewCallout | null;
  readonly arenaName?: string;
  readonly onReplay?: () => void;
  readonly testID?: string;
};

export function FightViewBottomBand({
  mode,
  callout,
  arenaName = FIGHT_VIEW_ARENA_NAME,
  onReplay,
  testID = 'fight-view-band',
}: FightViewBottomBandProps): React.ReactElement {
  if (mode === 'rewatch') {
    return (
      <View style={styles.band} testID={testID}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Replay fight"
          onPress={onReplay}
          style={({ pressed }) => [styles.replayBtn, pressed ? styles.replayPressed : null]}
          testID={`${testID}-replay`}
        >
          <Image
            source={uiKitAssets.glyphReplay}
            style={styles.replayGlyph}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.replayLabel} allowFontScaling>
            Replay
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.band} testID={testID}>
      {callout ? (
        <View style={styles.plate} testID={`${testID}-callout`}>
          <View style={[styles.rivet, styles.rivetTL]} />
          <View style={[styles.rivet, styles.rivetTR]} />
          <View style={[styles.rivet, styles.rivetBL]} />
          <View style={[styles.rivet, styles.rivetBR]} />
          <Text style={styles.headline} allowFontScaling>
            {callout.headline}
          </Text>
          <Text style={styles.detail} allowFontScaling>
            {callout.detail}
          </Text>
        </View>
      ) : (
        <View style={styles.emptyCallout} testID={`${testID}-callout-empty`} />
      )}
      <View style={styles.tags}>
        <Text style={styles.tag} allowFontScaling testID={`${testID}-arena-name`}>
          {arenaName}
        </Text>
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
    paddingTop: 14,
    paddingBottom: 18,
    justifyContent: 'center',
  },
  plate: {
    position: 'relative',
    backgroundColor: garageTag.cream,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 7,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  rivet: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: garageTag.graphite,
  },
  rivetTL: { top: 5, left: 5 },
  rivetTR: { top: 5, right: 5 },
  rivetBL: { bottom: 5, left: 5 },
  rivetBR: { bottom: 5, right: 5 },
  headline: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    textAlign: 'center',
  },
  detail: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5b544a',
    marginTop: 3,
    textAlign: 'center',
  },
  emptyCallout: {
    minHeight: 64,
  },
  tags: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 14,
  },
  tag: {
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#6b6356',
    borderWidth: 2,
    borderColor: '#b9a98c',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  replayBtn: {
    minHeight: 52,
    backgroundColor: garageTag.mustard,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: garageTag.graphite,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  replayPressed: {
    backgroundColor: garageTag.mustardPressed,
  },
  replayGlyph: {
    width: 22,
    height: 22,
  },
  replayLabel: {
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
});
