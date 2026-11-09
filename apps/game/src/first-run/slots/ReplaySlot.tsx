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
import { formatOutcomeLine } from '../../replay/confirmedResult';
import {
  FX_CAPTURE_HOLD_MS,
  FX_CAPTURE_HOLD_SETTLE_MS,
  completeFxCaptureHold,
  formatFxCaptureLog,
  initialFxCaptureHoldState,
  noteFxCaptureCue,
  type FxCaptureHoldState,
} from '../../replay/fxCaptureHold';
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
  const fxHoldRef = useRef<FxCaptureHoldState>(initialFxCaptureHoldState());
  const fxHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playback, setPlayback] = useState<PlaybackUiState>(() => initialPlaybackUi(0));
  const liveCapture = isLiveFightCaptureEnabled();

  const resolution = useMemo(() => resolveFirstRunConfirmedResult(lastFight), [lastFight]);

  const onPlaybackChange = useCallback((state: PlaybackUiState) => {
    setPlayback(state);
  }, []);

  useEffect(() => {
    return () => {
      if (fxHoldTimerRef.current) clearTimeout(fxHoldTimerRef.current);
    };
  }, []);

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
          // Live capture needs motion poses + FX frames for stills (not reduced-motion accents).
          reducedMotion={liveCapture ? false : reducedMotion}
          autoPlay
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
