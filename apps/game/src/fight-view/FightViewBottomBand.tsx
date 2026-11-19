/**
 * Bottom band under the arena.
 * First watch: fixed-height call-out slot only (no transport — never reveal a replay).
 * Rewatch: compact call-out plate (hit messages stay visible) + replay controls
 * (play/pause, scrub bar, 2× fast-forward). Never Continue / Mute here.
 * Height is always FIGHT_VIEW_BAND_CONTENT_HEIGHT so the arena never jumps (D10 / E2).
 * Visual SoT: inbox mockups d10-fight-view-callout / d10-fight-view-quiet.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { garageTag, uiKitAssets } from '../garage-tag';
import { FIGHT_VIEW_CALLOUT_MIN_DWELL_MS, formatCalloutHeadlineBase } from './calloutQueue';
import type { FightViewCallout, FightViewMode } from './types';
import {
  FIGHT_VIEW_BAND_CONTENT_HEIGHT,
  FIGHT_VIEW_CALLOUT_PLATE_HEIGHT,
  FIGHT_VIEW_REWATCH_CALLOUT_HEIGHT,
  FIGHT_VIEW_REWATCH_CONTROLS_HEIGHT,
  FIGHT_VIEW_REWATCH_FAST_SPEED,
  scrubProgressFromX,
} from './types';

/** D10 empty-slot dashed border. */
const SLOT_DASH = '#c9b896';
const SCRUB_A11Y_STEP = 0.1;

export type FightViewTransport = {
  readonly playing: boolean;
  /** 0–1 share of the replay already shown. */
  readonly progress: number;
  /** Current playback rate (1 or FIGHT_VIEW_REWATCH_FAST_SPEED). */
  readonly speed: number;
  readonly onTogglePlay: () => void;
  readonly onToggleSpeed: () => void;
  readonly onSeek: (progress: number) => void;
};

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
  /** Rewatch replay controls; ignored on first watch. */
  readonly transport?: FightViewTransport;
  readonly testID?: string;
};

export function FightViewBottomBand({
  mode,
  callout,
  calloutCount = 1,
  pendingCount = 0,
  dwellKey = null,
  reducedMotion = false,
  transport,
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

  const rewatch = mode === 'rewatch';
  const dots = Math.max(0, pendingCount);
  const baseHeadline = callout ? formatCalloutHeadlineBase(callout) : '';
  const showCount = Boolean(callout && calloutCount > 1);

  const plate = callout ? (
    <View style={[styles.plate, rewatch ? styles.plateCompact : null]} testID={`${testID}-callout`}>
      {dots > 0 ? (
        <View style={styles.dots} testID={`${testID}-queue-dots`}>
          {Array.from({ length: dots }, (_, i) => (
            <View key={`q-${i}`} style={styles.dot} />
          ))}
        </View>
      ) : null}
      <View style={styles.headlineRow}>
        <Text
          style={[styles.headline, rewatch ? styles.headlineCompact : null]}
          allowFontScaling
          numberOfLines={1}
        >
          {baseHeadline}
        </Text>
        {showCount ? (
          <Text
            style={[styles.count, rewatch ? styles.countCompact : null]}
            allowFontScaling
            numberOfLines={1}
            testID={`${testID}-count`}
          >
            ×{calloutCount}
          </Text>
        ) : null}
      </View>
      <Text
        style={[styles.detail, rewatch ? styles.detailCompact : null]}
        allowFontScaling
        numberOfLines={rewatch ? 1 : 2}
      >
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
    <View
      style={[styles.emptyCallout, rewatch ? styles.plateCompact : null]}
      testID={`${testID}-callout-empty`}
    />
  );

  if (rewatch) {
    return (
      <View style={[styles.band, styles.bandRewatch]} testID={testID}>
        {plate}
        {transport ? <RewatchControls transport={transport} testID={testID} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.band} testID={testID}>
      {plate}
    </View>
  );
}

function RewatchControls({
  transport,
  testID,
}: {
  readonly transport: FightViewTransport;
  readonly testID: string;
}): React.ReactElement {
  const { playing, progress, speed, onTogglePlay, onToggleSpeed, onSeek } = transport;
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const ended = !playing && progress >= 1;
  const fast = speed > 1;
  const shown = Math.max(0, Math.min(1, dragProgress ?? progress));

  const fromEvent = (e: GestureResponderEvent) =>
    scrubProgressFromX(e.nativeEvent.locationX, trackWidth);

  const playLabel = ended ? 'Replay fight' : playing ? 'Pause' : 'Play';
  const playGlyph = ended
    ? uiKitAssets.glyphReplay
    : playing
      ? uiKitAssets.glyphPause
      : uiKitAssets.glyphPlay;

  return (
    <View style={styles.controls} testID={`${testID}-controls`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playLabel}
        onPress={onTogglePlay}
        style={({ pressed }) => [styles.ctrlBtn, pressed ? styles.ctrlPressed : null]}
        testID={`${testID}-play`}
      >
        <Image
          source={playGlyph}
          style={styles.ctrlGlyph}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </Pressable>
      <View
        style={styles.scrub}
        onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setDragProgress(fromEvent(e))}
        onResponderMove={(e) => setDragProgress(fromEvent(e))}
        onResponderRelease={(e) => {
          const next = fromEvent(e);
          setDragProgress(null);
          onSeek(next);
        }}
        onResponderTerminate={() => setDragProgress(null)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Fight progress"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(shown * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const delta =
            e.nativeEvent.actionName === 'increment' ? SCRUB_A11Y_STEP : -SCRUB_A11Y_STEP;
          onSeek(Math.max(0, Math.min(1, progress + delta)));
        }}
        testID={`${testID}-scrub`}
      >
        <View style={styles.scrubTrack} pointerEvents="none">
          <View
            style={[styles.scrubFill, { width: `${shown * 100}%` }]}
            testID={`${testID}-scrub-fill`}
          />
        </View>
        <View
          pointerEvents="none"
          style={[styles.scrubThumb, { left: `${shown * 100}%` }]}
          testID={`${testID}-scrub-thumb`}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fast ? 'Normal speed' : 'Fast forward'}
        accessibilityState={{ selected: fast }}
        onPress={onToggleSpeed}
        style={({ pressed }) => [
          styles.ctrlBtn,
          fast ? null : styles.ctrlBtnIdle,
          pressed ? styles.ctrlPressed : null,
        ]}
        testID={`${testID}-speed`}
      >
        <Text style={styles.speedLabel} allowFontScaling={false}>
          {`${FIGHT_VIEW_REWATCH_FAST_SPEED}×`}
        </Text>
      </Pressable>
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
  bandRewatch: {
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  plate: {
    height: FIGHT_VIEW_CALLOUT_PLATE_HEIGHT,
    position: 'relative',
    backgroundColor: garageTag.white,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  plateCompact: {
    height: FIGHT_VIEW_REWATCH_CALLOUT_HEIGHT,
  },
  dots: {
    position: 'absolute',
    top: 6,
    right: 8,
    flexDirection: 'row',
    gap: 3,
    zIndex: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SLOT_DASH,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  headline: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    textAlign: 'center',
    lineHeight: 32,
  },
  headlineCompact: {
    fontSize: 20,
    letterSpacing: 1.2,
    lineHeight: 23,
  },
  count: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: garageTag.oxide,
    marginLeft: 6,
    lineHeight: 28,
  },
  countCompact: {
    fontSize: 16,
    lineHeight: 20,
  },
  detail: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5b544a',
    marginTop: 5,
    textAlign: 'center',
  },
  detailCompact: {
    fontSize: 12,
    marginTop: 1,
  },
  timerTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
  },
  timerFill: {
    height: 4,
    backgroundColor: garageTag.mustard,
  },
  timerFillFull: {
    width: '100%',
  },
  emptyCallout: {
    height: FIGHT_VIEW_CALLOUT_PLATE_HEIGHT,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: SLOT_DASH,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  controls: {
    height: FIGHT_VIEW_REWATCH_CONTROLS_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ctrlBtn: {
    width: FIGHT_VIEW_REWATCH_CONTROLS_HEIGHT,
    height: FIGHT_VIEW_REWATCH_CONTROLS_HEIGHT,
    backgroundColor: garageTag.mustard,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlBtnIdle: {
    backgroundColor: garageTag.white,
  },
  ctrlPressed: {
    backgroundColor: garageTag.mustardPressed,
  },
  ctrlGlyph: {
    width: 22,
    height: 22,
  },
  speedLabel: {
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.4,
    color: garageTag.graphite,
  },
  scrub: {
    flex: 1,
    height: FIGHT_VIEW_REWATCH_CONTROLS_HEIGHT,
    justifyContent: 'center',
  },
  scrubTrack: {
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: garageTag.graphite,
    backgroundColor: garageTag.white,
    overflow: 'hidden',
  },
  scrubFill: {
    height: '100%',
    backgroundColor: garageTag.mustard,
  },
  scrubThumb: {
    position: 'absolute',
    top: (FIGHT_VIEW_REWATCH_CONTROLS_HEIGHT - 20) / 2,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    backgroundColor: garageTag.mustard,
  },
});
