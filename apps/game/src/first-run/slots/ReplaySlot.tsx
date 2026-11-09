import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  PrimaryButton,
  ReplayAudioControls,
  ScreenChrome,
  ScreenHeader,
  SecondaryButton,
  garageTag,
} from '../../garage-tag';
import { useFightSession } from '../../fight';
import { CanonicalReplayPlayer } from '../../replay/CanonicalReplayPlayer';
import { formatOutcomeLine } from '../../replay/confirmedResult';
import { resolveSessionConfirmedResult } from '../../replay/resolveSessionResult';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/**
 * Shell Replay slot — F10 domain player inside Garage Tag chrome.
 * Prefers F9 `lastFight` sealed replay; falls back to DEV golden fixture.
 */
export function ReplaySlot(): React.ReactElement {
  const { goBack, goNext, muted, toggleMute, reducedMotion } = useFirstRun();
  const { lastFight } = useFightSession();

  const confirmed = useMemo(() => resolveSessionConfirmedResult(lastFight), [lastFight]);

  return (
    <ScreenChrome
      testID="slot-replay"
      scroll={false}
      footer={
        <>
          <PrimaryButton label="Continue to result" onPress={goNext} testID="replay-continue" />
          <SecondaryButton
            label={muted ? 'Unmute' : 'Mute'}
            onPress={toggleMute}
            testID="replay-mute"
          />
        </>
      }
    >
      <ScreenHeader title="Fight Replay" onBack={goBack} />
      <View style={styles.player}>
        <CanonicalReplayPlayer
          result={confirmed}
          muted={muted}
          autoPlay
          testID="slot-replay-player"
        />
      </View>
      <ReplayAudioControls
        playing={false}
        muted={muted}
        progress={0}
        reducedMotion={reducedMotion}
        onTogglePlay={() => undefined}
        onToggleMute={toggleMute}
        onReplay={() => undefined}
        testID="replay-controls"
      />
      <DomainNote
        text={
          confirmed.serverConfirmed
            ? `Domain: F10 · server-confirmed replay · ${formatOutcomeLine(confirmed.outcome)}`
            : 'Domain: F10 · DEV golden fixture until F9 lastFight is available. Mute/reduced-motion from shell.'
        }
      />
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  player: {
    flex: 1,
    minHeight: 280,
    backgroundColor: garageTag.graphite,
    overflow: 'hidden',
  },
});
