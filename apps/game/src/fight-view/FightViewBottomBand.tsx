/**
 * Bottom band under the arena: fixed-height call-out slot (first watch),
 * or a single REPLAY button (rewatch). Never shows scrubber / pause / Continue / Mute.
 * Height is always FIGHT_VIEW_BAND_CONTENT_HEIGHT so the arena never jumps (D10 / E2).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { garageTag, uiKitAssets } from '../garage-tag';
import { FIGHT_VIEW_CALLOUT_MIN_DWELL_MS, formatCalloutHeadline } from './calloutQueue';
import type { FightViewCallout, FightViewMode } from './types';
import { FIGHT_VIEW_BAND_CONTENT_HEIGHT, FIGHT_VIEW_CALLOUT_PLATE_HEIGHT } from './types';

export type FightViewBottomBandProps = {
  readonly mode: FightViewMode;
  readonly callout: FightViewCallout | null;
  /** Collapse counter for the visible plate (`HIT ×3`). */
  readonly calloutCount?: number;
  /** Pending queue length — rendered as dots top-right. */
  readonly pendingCount?: number;
  /**
   * Changes only when a new plate starts its dwell (not on ×n collapse).
   * Restarts the mustard timer bar.
   */
  readonly dwellKey?: number | null;
  readonly reducedMotion?: boolean;
  readonly onReplay?: () => void;
  readonly testID?: string;
};

export function FightViewBottomBand({
  mode,
  callout,
  calloutCount = 1,
  pendingCount = 0,
  dwellKey = null,
  reducedMotion = false,
  onReplay,
  testID = 'fight-view-band',
}: FightViewBottomBandProps): React.ReactElement {
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (!callout || dwellKey === null) {
      progress.setValue(0);
      return;
    }
    progress.setValue(1);
    if (reducedMotion) {
      // Still show the plate; no animated timer (D10: no flashy transitions).
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 0,
      duration: FIGHT_VIEW_CALLOUT_MIN_DWELL_MS,
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      anim.stop();
    };
  }, [callout, dwellKey, reducedMotion, progress]);

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

  const dots = Math.max(0, pendingCount);

  return (
    <View style={styles.band} testID={testID}>
      {callout ? (
        <View style={styles.plate} testID={`${testID}-callout`}>
          <View style={[styles.rivet, styles.rivetTL]} />
          <View style={[styles.rivet, styles.rivetTR]} />
          <View style={[styles.rivet, styles.rivetBL]} />
          <View style={[styles.rivet, styles.rivetBR]} />
          {dots > 0 ? (
            <View style={styles.dots} testID={`${testID}-queue-dots`}>
              {Array.from({ length: dots }, (_, i) => (
                <View key={`q-${i}`} style={styles.dot} />
              ))}
            </View>
          ) : null}
          <Text style={styles.headline} allowFontScaling numberOfLines={1}>
            {formatCalloutHeadline(callout, calloutCount)}
          </Text>
          <Text style={styles.detail} allowFontScaling numberOfLines={2}>
            {callout.detail}
          </Text>
          <View style={styles.timerTrack} testID={`${testID}-timer`}>
            {reducedMotion ? (
              <View style={[styles.timerFill, styles.timerFillFull]} />
            ) : (
              <Animated.View
                style={[
                  styles.timerFill,
                  {
                    width: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            )}
          </View>
        </View>
      ) : (
        <View style={styles.emptyCallout} testID={`${testID}-callout-empty`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    height: FIGHT_VIEW_BAND_CONTENT_HEIGHT,
    backgroundColor: garageTag.cream,
    borderTopWidth: 4,
    borderTopColor: garageTag.graphite,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  plate: {
    height: FIGHT_VIEW_CALLOUT_PLATE_HEIGHT,
    position: 'relative',
    backgroundColor: garageTag.cream,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 7,
    paddingVertical: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
  dots: {
    position: 'absolute',
    top: 8,
    right: 14,
    flexDirection: 'row',
    gap: 4,
    zIndex: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: garageTag.graphite,
  },
  headline: {
    fontSize: 26,
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
    marginTop: 2,
    textAlign: 'center',
  },
  timerTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(48,45,39,0.12)',
  },
  timerFill: {
    height: 3,
    backgroundColor: garageTag.mustard,
  },
  timerFillFull: {
    width: '100%',
  },
  emptyCallout: {
    height: FIGHT_VIEW_CALLOUT_PLATE_HEIGHT,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#b9a98c',
    borderRadius: 7,
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
