import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';
import { isDesignCaptureEnabled } from '../../design-capture';
import { useFightSession } from '../../fight';
import { CanonicalReplayPlayer } from '../../replay/CanonicalReplayPlayer';
import { resolveFirstRunConfirmedResult } from '../../replay/resolveSessionResult';
import {
  confirmedResultForResultCapture,
  ResultOverlay,
  ResultOverlayBand,
  resolveOutcomeKind,
  resultCaptureRecord,
} from '../../result-overlay';
import { useFirstRun } from '../FirstRunContext';

/**
 * Capture / deep-link Result surface (not in ROUTE_FLOW).
 * D2 first-run shows the Result overlay on Replay after KO. This slot stays for
 * design-capture deep links that still land on FightResult — same scrim + card
 * over the **live arena** (never a flat opaque fill).
 * E1: `?result=victory|defeat` forces capture fixtures so both action-band
 * stills are reviewable without a second live fight.
 */
export function FightResultSlot(): React.ReactElement {
  const {
    goTo,
    goBack,
    muted,
    musicEnabled,
    effectsEnabled,
    reducedMotion,
    setFightViewMode,
    setShowResultOverlay,
    resultCaptureScenario,
  } = useFirstRun();
  const { lastFight } = useFightSession();
  const insets = useSafeAreaInsets();

  const resolution = useMemo(() => {
    if (isDesignCaptureEnabled() && resultCaptureScenario) {
      return {
        status: 'confirmed' as const,
        confirmed: confirmedResultForResultCapture(resultCaptureScenario),
      };
    }
    return resolveFirstRunConfirmedResult(lastFight);
  }, [lastFight, resultCaptureScenario]);

  if (resolution.status === 'blocked') {
    return (
      <ScreenChrome
        testID="slot-result"
        footer={
          <PrimaryButton
            label="Back to confirm"
            onPress={() => goTo('ConfirmFight')}
            testID="result-back-blocked"
          />
        }
      >
        <ScreenHeader title="Fight Result" onBack={goBack} />
        <StatusErrorBanner
          title="Backend result required"
          detail={resolution.message}
          testID="result-blocked"
        />
      </ScreenChrome>
    );
  }

  const confirmed = resolution.confirmed;
  const outcomeKind = resolveOutcomeKind(confirmed);
  // Capture stills: mockup-shaped W–L so victory ± NEW RECORD / defeat are reviewable
  // before E2 ranking is on this stack. Live Replay overlay omits invented W–L.
  const captureRecord = resultCaptureRecord(
    confirmed.newRecord === true
      ? 'victory-new-record'
      : outcomeKind === 'defeat'
        ? 'defeat'
        : 'victory',
  );

  const arenaOverlay = (
    <ResultOverlay
      confirmed={confirmed}
      record={captureRecord}
      opponentBotoreName="Magistra Volta"
      muted={muted}
      musicEnabled={musicEnabled}
      effectsEnabled={effectsEnabled}
      reducedMotion={reducedMotion}
      topInset={insets.top}
      testID="fight-result"
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']} testID="slot-result">
      <View style={styles.arena}>
        <CanonicalReplayPlayer
          result={confirmed}
          muted={muted}
          musicEnabled={musicEnabled}
          effectsEnabled={effectsEnabled}
          reducedMotion={reducedMotion}
          autoPlay
          showLocalControls={false}
          layoutMode="arenaFirst"
          arenaOverlay={arenaOverlay}
          testID="slot-result-player"
        />
      </View>
      <ResultOverlayBand
        onBackToStable={() => goTo('Stable')}
        onWatchAgain={() => {
          setFightViewMode('rewatch');
          setShowResultOverlay(false);
          goTo('Replay');
        }}
        onRanking={() => goTo('Ranking')}
        testID="result-overlay-band"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: garageTag.cream,
  },
  arena: {
    flex: 1,
    minHeight: 0,
    backgroundColor: garageTag.graphite,
    position: 'relative',
  },
});
