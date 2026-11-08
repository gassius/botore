import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  KitArtPlaceholder,
  Nameplate,
  PrimaryButton,
  ReplayAudioControls,
  ScreenChrome,
  ScreenHeader,
  SecondaryButton,
  garageTag,
} from '../../garage-tag';
import { BattleReplayScreen } from '../../screens/BattleReplayScreen';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/** Route slot: Replay — F10 owns recorded replay domain; shell mounts chrome + existing player. */
export function ReplaySlot(): React.ReactElement {
  const { goBack, goNext, muted, toggleMute, reducedMotion } = useFirstRun();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showLegacyPlayer, setShowLegacyPlayer] = useState(false);

  if (showLegacyPlayer) {
    return (
      <View style={styles.legacy} testID="slot-replay-legacy">
        <SecondaryButton label="Back to replay shell" onPress={() => setShowLegacyPlayer(false)} />
        <BattleReplayScreen />
      </View>
    );
  }

  return (
    <ScreenChrome
      testID="slot-replay"
      scroll={false}
      footer={
        <>
          <SecondaryButton
            label="Open golden fixture player"
            onPress={() => setShowLegacyPlayer(true)}
            testID="replay-legacy"
          />
          <PrimaryButton label="Continue to result" onPress={goNext} testID="replay-continue" />
        </>
      }
    >
      <ScreenHeader title="Fight Replay" onBack={goBack} />
      <View style={styles.hud}>
        <Nameplate name="Rivet" badge="You" style={styles.plate} />
        <Nameplate name="Bolt" style={styles.plate} />
      </View>
      <View style={styles.arena}>
        <KitArtPlaceholder label="Arena + bots" detail="PLACEHOLDER — F7/F10 + Game Art" stagger="none" />
      </View>
      <ReplayAudioControls
        playing={playing}
        muted={muted}
        progress={progress}
        reducedMotion={reducedMotion}
        onTogglePlay={() => {
          setPlaying((p) => !p);
          if (!playing) setProgress((v) => Math.min(1, v + 0.15));
        }}
        onToggleMute={toggleMute}
        onReplay={() => {
          setPlaying(false);
          setProgress(0);
        }}
        testID="replay-controls"
      />
      <DomainNote text="Domain: F10 recorded replay. Shell exposes mute/reduced-motion hooks; fixture player is existing infrastructure." />
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    gap: 8,
  },
  plate: {
    flex: 1,
  },
  arena: {
    flex: 1,
    minHeight: 200,
  },
  legacy: {
    flex: 1,
    backgroundColor: garageTag.cream,
    padding: 8,
    gap: 8,
  },
});
