import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  PrimaryButton,
  ReplayAudioControls,
  ScreenChrome,
  ScreenHeader,
  SecondaryButton,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';
import { useFightSession } from '../../fight';
import {
  CanonicalReplayPlayer,
  type CanonicalReplayPlayerHandle,
} from '../../replay/CanonicalReplayPlayer';
import { formatOutcomeLine } from '../../replay/confirmedResult';
import { initialPlaybackUi, type PlaybackUiState } from '../../replay/playbackControl';
import { isLiveFightCaptureEnabled } from '../../design-capture';
import { resolveFirstRunConfirmedResult } from '../../replay/resolveSessionResult';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/**
 * Shell Replay slot — F10 domain player inside Garage Tag chrome.
 * Server-precomputed lastFight only (same sealed builds as garage → confirm).
 * Never silently plays DEV golden fixtures on the first-run path.
 */
export function ReplaySlot(): React.ReactElement {
  const { goBack, goNext, muted, toggleMute, reducedMotion } = useFirstRun();
  const { lastFight, fightKind } = useFightSession();
  const playerRef = useRef<CanonicalReplayPlayerHandle>(null);
  const impactHeld = useRef(false);
  const [playback, setPlayback] = useState<PlaybackUiState>(() => initialPlaybackUi(0));
  const liveCapture = isLiveFightCaptureEnabled();

  const resolution = useMemo(() => resolveFirstRunConfirmedResult(lastFight), [lastFight]);

  const onPlaybackChange = useCallback(
    (state: PlaybackUiState) => {
      setPlayback(state);
      // C3 UI evidence: hold a mid-impact frame for the capture still.
      if (
        liveCapture &&
        !impactHeld.current &&
        state.playing &&
        state.progress >= 0.28 &&
        state.progress < 0.72
      ) {
        impactHeld.current = true;
        playerRef.current?.pause();
        console.log(`BOTORE_CAPTURE_REPLAY_IMPACT:progress=${state.progress.toFixed(3)}`);
      }
    },
    [liveCapture],
  );

  if (resolution.status === 'blocked') {
    return (
      <ScreenChrome
        testID="slot-replay"
        footer={
          <PrimaryButton label="Back to confirm" onPress={goBack} testID="replay-back-blocked" />
        }
      >
        <ScreenHeader title="Fight Replay" onBack={goBack} />
        <StatusErrorBanner
          title="Server fight required"
          detail={resolution.message}
          testID="replay-blocked"
        />
        <DomainNote
          text={
            fightKind === 'dev'
              ? 'Domain: F10 · blocked — DEV adapters cannot supply a sealed combat-v1 replay for first-run.'
              : `Domain: F10 · blocked (${resolution.reason}) — no fixture playback.`
          }
        />
      </ScreenChrome>
    );
  }

  const confirmed = resolution.confirmed;

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
          // Live capture needs motion poses for mid-impact stills.
          reducedMotion={liveCapture ? false : reducedMotion}
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
        onTogglePlay={() => {
          playerRef.current?.playUiTap();
          playerRef.current?.togglePlay();
        }}
        onToggleMute={() => {
          playerRef.current?.playUiTap();
          toggleMute();
        }}
        onReplay={() => {
          playerRef.current?.playUiTap();
          playerRef.current?.replay();
        }}
        testID="replay-controls"
      />
      <DomainNote
        text={`Domain: F10 · server-confirmed replay · ${formatOutcomeLine(confirmed.outcome)} · builds ${confirmed.builds.attacker.paint}/${confirmed.builds.attacker.weapon}`}
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
