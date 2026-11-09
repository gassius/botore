import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { garageTag } from './tokens';
import { uiKitAssets } from './assets';
import { GlyphButton } from './GlyphButton';

export type ReplayAudioControlsProps = {
  playing: boolean;
  muted: boolean;
  /** 0..1 timeline progress — runtime data, not baked into track art. */
  progress: number;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onReplay?: () => void;
  reducedMotion?: boolean;
  testID?: string;
};

/**
 * Recorded-replay controls only — never attack/skill actions.
 * Mute exposes actual state via a11y label + selected glyph.
 */
export function ReplayAudioControls({
  playing,
  muted,
  progress,
  onTogglePlay,
  onToggleMute,
  onReplay,
  reducedMotion = false,
  testID,
}: ReplayAudioControlsProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.bar} testID={testID}>
      <Text style={styles.caption} allowFontScaling>
        Replay
      </Text>
      <View style={styles.row}>
        <GlyphButton
          source={playing ? uiKitAssets.glyphPause : uiKitAssets.glyphPlay}
          accessibilityLabel={playing ? 'Pause replay' : 'Play replay'}
          onPress={onTogglePlay}
          {...(testID ? { testID: `${testID}-play` } : {})}
        />
        <View
          style={styles.timeline}
          accessibilityRole="progressbar"
          accessibilityValue={{ now: Math.round(clamped * 100), min: 0, max: 100 }}
        >
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${clamped * 100}%` }]} />
          </View>
          <View style={[styles.thumb, { left: `${clamped * 100}%` }]} />
        </View>
        <GlyphButton
          source={muted ? uiKitAssets.glyphMute : uiKitAssets.glyphSound}
          accessibilityLabel={muted ? 'Unmute audio' : 'Mute audio'}
          selected={muted}
          onPress={onToggleMute}
          {...(testID ? { testID: `${testID}-mute` } : {})}
        />
        {onReplay ? (
          <GlyphButton
            source={uiKitAssets.glyphReplay}
            accessibilityLabel="Replay from start"
            onPress={onReplay}
            {...(testID ? { testID: `${testID}-replay` } : {})}
          />
        ) : null}
      </View>
      {reducedMotion ? (
        <Text style={styles.motionNote} allowFontScaling>
          Reduced motion on — outcomes preserved
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: garageTag.paper,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    padding: 12,
    gap: 8,
  },
  caption: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeline: {
    flex: 1,
    height: garageTag.touchMin,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: garageTag.cream,
    borderWidth: 1,
    borderColor: garageTag.graphite,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: garageTag.mustard,
  },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: garageTag.cream,
    borderWidth: 2,
    borderColor: garageTag.graphite,
    top: '50%',
    marginTop: -10,
  },
  motionNote: {
    fontSize: 12,
    color: garageTag.steel,
    fontWeight: '600',
  },
});
