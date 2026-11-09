import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import {
  CanonicalReplayPlayer,
  type CanonicalReplayPlayerHandle,
} from '../../replay/CanonicalReplayPlayer';
import { formatOutcomeLine } from '../../replay/confirmedResult';
import { initialPlaybackUi, type PlaybackUiState } from '../../replay/playbackControl';
import { resolveSessionConfirmedResult } from '../../replay/resolveSessionResult';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/**
 * Shell Replay slot — F10 domain player inside Garage Tag chrome.
 * Prefers F9 `lastFight` sealed replay; falls back to DEV golden fixture.
 * Shell ReplayAudioControls are the authoritative play/pause/timeline surface.
 */
export function ReplaySlot(): React.ReactElement {
  const { goBack, goNext, muted, toggleMute, reducedMotion } = useFirstRun();
  const { lastFight } = useFightSession();
  const playerRef = useRef<CanonicalReplayPlayerHandle>(null);
  const [playback, setPlayback] = useState<PlaybackUiState>(() => initialPlaybackUi(0));

  const confirmed = useMemo(() => resolveSessionConfirmedResult(lastFight), [lastFight]);

  const onPlaybackChange = useCallback((state: PlaybackUiState) => {
    setPlayback(state);
  }, []);

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
          ref={playerRef}
          result={confirmed}
          muted={muted}
          reducedMotion={reducedMotion}
          autoPlay
          showLocalControls={false}
          onPlaybackChange={onPlaybackChange}
          testID="slot-replay-player"
        />
      </View>
      <ReplayAudioControls
        playing={playback.playing}
        muted={muted}
        progress={playback.progress}
        reducedMotion={reducedMotion}
        onTogglePlay={() => playerRef.current?.togglePlay()}
        onToggleMute={toggleMute}
        onReplay={() => playerRef.current?.replay()}
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
    minHeight: 200,
    minWidth: 0,
    backgroundColor: garageTag.graphite,
    // Avoid clipping shell-adjacent controls; stage flex-shrinks inside the player.
    overflow: 'hidden',
  },
});
