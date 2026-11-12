import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { ArenaFxFamily } from '../../arena/environmentPin';
import {
  CanonicalReplayPlayer,
  type CanonicalReplayPlayerHandle,
} from '../../replay/CanonicalReplayPlayer';
import {
  FX_CAPTURE_HOLD_MS,
  FX_CAPTURE_HOLD_SETTLE_MS,
  FX_CAPTURE_IDLE_BEFORE_PLAY_MS,
  completeFxCaptureHold,
  formatFxCaptureLog,
  formatReplayIdleLog,
  formatReplayPlayLog,
  initialFxCaptureHoldState,
  noteFxCaptureCue,
  type FxCaptureHoldState,
} from '../../replay/fxCaptureHold';
import { initialPlaybackUi, type PlaybackUiState } from '../../replay/playbackControl';
import { isLiveFightCaptureEnabled } from '../../design-capture';
import { resolveFirstRunConfirmedResult } from '../../replay/resolveSessionResult';
import { useFirstRun } from '../FirstRunContext';

/**
 * Shell Replay slot — F10 domain player inside Garage Tag chrome.
 * Server-precomputed lastFight only (same sealed builds as garage → confirm).
 * Never silently plays DEV golden fixtures on the first-run path.
 */
export function ReplaySlot(): React.ReactElement {
  const { goBack, goNext, muted, toggleMute, musicEnabled, effectsEnabled, reducedMotion } =
    useFirstRun();
  const { lastFight } = useFightSession();
  const playerRef = useRef<CanonicalReplayPlayerHandle>(null);
  const fxHoldRef = useRef<FxCaptureHoldState>(initialFxCaptureHoldState());
  const fxHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idlePlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playback, setPlayback] = useState<PlaybackUiState>(() => initialPlaybackUi(0));
  const liveCapture = isLiveFightCaptureEnabled();

  const resolution = useMemo(() => resolveFirstRunConfirmedResult(lastFight), [lastFight]);
  const replayChecksum =
    resolution.status === 'confirmed' ? resolution.confirmed.replay.checksum : null;

  const onPlaybackChange = useCallback((state: PlaybackUiState) => {
    setPlayback(state);
  }, []);

  useEffect(() => {
    return () => {
      if (fxHoldTimerRef.current) clearTimeout(fxHoldTimerRef.current);
      if (idlePlayTimerRef.current) clearTimeout(idlePlayTimerRef.current);
    };
  }, []);

  // Live capture: start paused so CI can still replay-start / arena at idle,
  // then auto-play after a short window (avoids start≡first-hit-hold).
  useEffect(() => {
    if (!liveCapture || !replayChecksum) return;
    console.log(formatReplayIdleLog());
    if (idlePlayTimerRef.current) clearTimeout(idlePlayTimerRef.current);
    idlePlayTimerRef.current = setTimeout(() => {
      console.log(formatReplayPlayLog());
      playerRef.current?.play();
    }, FX_CAPTURE_IDLE_BEFORE_PLAY_MS);
    return () => {
      if (idlePlayTimerRef.current) clearTimeout(idlePlayTimerRef.current);
    };
  }, [liveCapture, replayChecksum]);

  const onFxCue = useCallback(
    (family: ArenaFxFamily) => {
      if (!liveCapture) return;
      console.log(formatFxCaptureLog(family, 'fire'));
      const { next, shouldHold } = noteFxCaptureCue(fxHoldRef.current, family);
      fxHoldRef.current = next;
      if (!shouldHold) return;
      // Pause first so EventFxLayer freezes the peak FX frame; log HOLD only after
      // settle so CI screencaps the spark/dust, not the pre-cue idle frame.
      playerRef.current?.pause();
      if (fxHoldTimerRef.current) clearTimeout(fxHoldTimerRef.current);
      fxHoldTimerRef.current = setTimeout(() => {
        console.log(formatFxCaptureLog(family, 'hold'));
        fxHoldTimerRef.current = setTimeout(() => {
          fxHoldRef.current = completeFxCaptureHold(fxHoldRef.current);
          console.log(formatFxCaptureLog(family, 'resume'));
          playerRef.current?.play();
        }, FX_CAPTURE_HOLD_MS);
      }, FX_CAPTURE_HOLD_SETTLE_MS);
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
          musicEnabled={musicEnabled}
          effectsEnabled={effectsEnabled}
          // Live capture needs motion poses + FX frames for stills (not reduced-motion accents).
          reducedMotion={liveCapture ? false : reducedMotion}
          // Live capture starts idle so replay-start ≠ first hit hold; play() after idle window.
          autoPlay={!liveCapture}
          showLocalControls={false}
          onPlaybackChange={onPlaybackChange}
          onFxCue={onFxCue}
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
