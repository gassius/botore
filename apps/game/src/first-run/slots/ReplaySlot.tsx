import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
  garageTag,
  uiKitAssets,
  GlyphButton,
} from '../../garage-tag';
import { useFightSession } from '../../fight';
import type { ArenaFxFamily } from '../../arena/environmentPin';
import {
  calloutFromCommand,
  createOnceHandoff,
  FightViewBottomBand,
  FightViewHud,
  FightViewMuteControl,
  FIGHT_VIEW_ARENA_HEIGHT_RATIO,
  FIGHT_VIEW_HUD_BELOW_INSET,
  FIGHT_VIEW_KO_HOLD_MS,
  shouldScheduleKoHandoff,
  updateCalloutAttackContext,
  type FightViewCallout,
} from '../../fight-view';
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
import { fighterDisplayName } from '../../replay/confirmedResult';
import type { AnimationCommand } from '../../replay-playback';
import type { ReplayPresentationState } from '../../replay/playbackState';
import { isLiveFightCaptureEnabled } from '../../design-capture';
import { resolveFirstRunConfirmedResult } from '../../replay/resolveSessionResult';
import { useFirstRun } from '../FirstRunContext';

/**
 * D1 Fight View — arena-first shell.
 * First watch: no back / transport / Continue; KO hold → Result handoff (D2 stub).
 * Rewatch: back + one REPLAY button; mute stays in-arena only.
 */
export function ReplaySlot(): React.ReactElement {
  const {
    goBack,
    goNext,
    goTo,
    muted,
    toggleMute,
    musicEnabled,
    effectsEnabled,
    reducedMotion,
    fightViewMode,
  } = useFirstRun();
  const insets = useSafeAreaInsets();
  const { lastFight } = useFightSession();
  const playerRef = useRef<CanonicalReplayPlayerHandle>(null);
  const fxHoldRef = useRef<FxCaptureHoldState>(initialFxCaptureHoldState());
  const fxHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idlePlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const koHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attackCtxRef = useRef<{ lastAttackerId: string | null; wasHeavy: boolean }>({
    lastAttackerId: null,
    wasHeavy: false,
  });
  const [callout, setCallout] = useState<FightViewCallout | null>(null);
  const [hp, setHp] = useState({ near: 1, far: 1 });
  const handOffOnceRef = useRef(createOnceHandoff(() => goNext()));
  const liveCapture = isLiveFightCaptureEnabled();
  const isRewatch = fightViewMode === 'rewatch';
  const topInset = insets.top;

  // Refresh the once-handoff when goNext identity changes (provider remount).
  useEffect(() => {
    handOffOnceRef.current = createOnceHandoff(() => goNext());
  }, [goNext]);

  const resolution = useMemo(() => resolveFirstRunConfirmedResult(lastFight), [lastFight]);
  const replayChecksum =
    resolution.status === 'confirmed' ? resolution.confirmed.replay.checksum : null;

  useEffect(() => {
    return () => {
      if (fxHoldTimerRef.current) clearTimeout(fxHoldTimerRef.current);
      if (idlePlayTimerRef.current) clearTimeout(idlePlayTimerRef.current);
      if (koHoldTimerRef.current) clearTimeout(koHoldTimerRef.current);
    };
  }, []);

  // First watch: ignore Android hardware back (no leave / confirm).
  useEffect(() => {
    if (isRewatch) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [isRewatch]);

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

  const onCommandApplied = useCallback(
    (cmd: AnimationCommand, presentation: ReplayPresentationState) => {
      attackCtxRef.current = updateCalloutAttackContext(cmd, attackCtxRef.current);
      const fighters =
        resolution.status === 'confirmed' ? resolution.confirmed.replay.fighters : [];
      // Keep the KO plate through victory_screen (null) until the Result handoff.
      if (cmd.kind !== 'victory_screen') {
        setCallout(
          calloutFromCommand(cmd, fighters, {
            lastAttackerId: attackCtxRef.current.lastAttackerId,
            wasHeavy: attackCtxRef.current.wasHeavy,
          }),
        );
      }
      setHp({ near: presentation.hp.near, far: presentation.hp.far });
    },
    [resolution],
  );

  /**
   * D2 stub — Result overlay owns the post-KO presentation.
   * Until D2 lands, auto-transition to the FightResult route after the KO hold.
   */
  const onFinished = useCallback(() => {
    if (!shouldScheduleKoHandoff(fightViewMode)) return;
    if (koHoldTimerRef.current) clearTimeout(koHoldTimerRef.current);
    koHoldTimerRef.current = setTimeout(() => {
      handOffOnceRef.current();
    }, FIGHT_VIEW_KO_HOLD_MS);
  }, [fightViewMode]);

  if (resolution.status === 'blocked') {
    return (
      <ScreenChrome
        testID="slot-replay"
        footer={
          <PrimaryButton label="Back to confirm" onPress={goBack} testID="replay-back-blocked" />
        }
      >
        <ScreenHeader title="Fight View" onBack={goBack} />
        <StatusErrorBanner
          title="Server fight required"
          detail={resolution.message}
          testID="replay-blocked"
        />
      </ScreenChrome>
    );
  }

  const confirmed = resolution.confirmed;
  const fighters = confirmed.replay.fighters;
  const nearName = fighterDisplayName(fighters[0]?.characterId, fighters);
  const farName = fighterDisplayName(fighters[1]?.characterId, fighters);

  const arenaOverlay = (
    <>
      <FightViewHud
        topInset={topInset}
        near={{
          botName: nearName,
          ownerLabel: 'You',
          hp: hp.near,
          fillColor: garageTag.oxide,
        }}
        far={{
          botName: farName,
          hp: hp.far,
          fillColor: garageTag.petrol,
        }}
      />
      {isRewatch ? (
        <View
          style={[styles.backWrap, { top: topInset + FIGHT_VIEW_HUD_BELOW_INSET + 4 }]}
          testID="fight-view-back-wrap"
        >
          <GlyphButton
            source={uiKitAssets.glyphBack}
            accessibilityLabel="Back"
            onPress={() => goTo('FightResult')}
            testID="fight-view-back"
          />
        </View>
      ) : null}
      <FightViewMuteControl
        muted={muted}
        onToggle={() => {
          playerRef.current?.playUiTap();
          toggleMute();
        }}
        testID="fight-view-mute"
      />
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']} testID="slot-replay">
      <View style={styles.root}>
        <View style={styles.arena} testID="fight-view-arena">
          <CanonicalReplayPlayer
            ref={playerRef}
            result={confirmed}
            muted={muted}
            musicEnabled={musicEnabled}
            effectsEnabled={effectsEnabled}
            reducedMotion={liveCapture ? false : reducedMotion}
            autoPlay={!liveCapture}
            showLocalControls={false}
            layoutMode="arenaFirst"
            arenaOverlay={arenaOverlay}
            onCommandApplied={onCommandApplied}
            onFinished={onFinished}
            onFxCue={onFxCue}
            testID="slot-replay-player"
          />
        </View>
        <View style={styles.band}>
          <FightViewBottomBand
            mode={fightViewMode}
            callout={isRewatch ? null : callout}
            onReplay={() => {
              playerRef.current?.playUiTap();
              playerRef.current?.replay();
              setCallout(null);
              setHp({ near: 1, far: 1 });
              attackCtxRef.current = { lastAttackerId: null, wasHeavy: false };
            }}
            testID="fight-view-band"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: garageTag.cream,
  },
  root: {
    flex: 1,
    backgroundColor: garageTag.cream,
  },
  arena: {
    flexGrow: FIGHT_VIEW_ARENA_HEIGHT_RATIO,
    flexShrink: 0,
    flexBasis: 0,
    minHeight: 0,
    backgroundColor: garageTag.graphite,
  },
  band: {
    flexGrow: 1 - FIGHT_VIEW_ARENA_HEIGHT_RATIO,
    flexShrink: 0,
    flexBasis: 0,
    minHeight: 120,
  },
  backWrap: {
    position: 'absolute',
    left: 10,
    zIndex: 8,
  },
});
