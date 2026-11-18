import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import type { MotionPose } from '../../assembler';
import type { KitPoseEntry, KitWeaponKind } from '../../assembler/workshopFrameTypes';
import { useTrialUiAudio } from '../../audio/useTrialUiAudio';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import {
  isDesignCaptureEnabled,
  readDesignCapturePoseCompare,
  type DesignCapturePoseCompare,
} from '../../design-capture/captureEnv';
import { peekCaptureIntent } from '../../design-capture/captureIntentState';
import {
  designCaptureClipPresentation,
  type FightTimelineSmear,
} from '../../fight/a2FightTimeline';
import { useFirstRun } from '../../first-run/FirstRunContext';
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import { paintDisplayLabel, weaponDisplayLabel } from '../../garage/loadout/proofCatalogue';
import {
  Nameplate,
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';
import { resolveOpponentPresentation } from '../../garage-tag/a6OpponentPresentation';
import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { isServerPlaybackReady } from '../../replay/serverPlayback';
import { classifySessionFailure, sessionFailureCopy } from '../../session-failure';
import { SessionFailureBanner } from '../../session-failure/SessionFailureBanner';
import { useForcedSessionFailure } from '../../session-failure/useForcedSessionFailure';
import { computeConfirmFightControls, shouldAcceptFightNavigation } from '../fightSessionLifecycle';
import { useFightSession } from '../FightSessionContext';
import { resolveA6OpponentPanel } from '../opponents/a6OpponentPanelAssets';
import { FightsRemainingPanel } from '../quota/FightsRemainingPanel';
import type { FightQuotaSummary } from '../quota/fightQuotaTypes';
import { buildTapeRows, designCaptureTapeStats } from '../taleOfTheTape';

function capturePoseMode(): DesignCapturePoseCompare | null {
  if (!isDesignCaptureEnabled()) return null;
  return peekCaptureIntent().poseCompare ?? readDesignCapturePoseCompare();
}

/** Design-capture only: near quick hit + far heavy hit (C11). */
function capturePosePair(): { near: MotionPose; far: MotionPose } | null {
  if (capturePoseMode() !== 'quick-vs-heavy') return null;
  return { near: 'attack', far: 'heavy_attack' };
}

function kitWeaponFromId(weaponId: string): KitWeaponKind {
  const id = weaponId.toLowerCase().replace(/-/g, '_');
  if (id.includes('axe')) return 'axe';
  if (id.includes('dagger')) return 'dagger';
  if (id.includes('mace')) return 'mace';
  if (id.includes('hammer')) return 'hammer';
  if (id.includes('spear')) return 'spear';
  if (id.includes('shield')) return 'shield';
  return 'sword';
}

/** A2b design-capture: clip-attack / clip-knockout stills for the deep-link weapon. */
function captureClipStill(weaponId: string): {
  motionPose: MotionPose;
  poseOverride: KitPoseEntry;
  smearOverlay?: FightTimelineSmear;
} | null {
  const mode = capturePoseMode();
  if (mode !== 'clip-attack' && mode !== 'clip-knockout') return null;
  return designCaptureClipPresentation(kitWeaponFromId(weaponId), mode);
}

/** ConfirmFight → D9 Tale of the Tape; starts combat-v1. */
export function ConfirmFightScreen(props: {
  onBack: () => void;
  onFightStarted: () => void;
}): React.ReactElement {
  const { loadout, session, canProgress, signOut } = useGarageSession();
  const { muted, musicEnabled, effectsEnabled } = useFirstRun();
  const uiAudio = useTrialUiAudio({ muted, musicEnabled, effectsEnabled });
  const forced = useForcedSessionFailure();
  const {
    selected,
    submit,
    list,
    startFight,
    clearSubmitError,
    candidatesKind,
    fightKind,
    prepareEligibility,
    refreshCandidates,
    fightInFlight,
    bumpNavigationGeneration,
    navigationGeneration,
    pendingIntent,
  } = useFightSession();
  // Inherit F8 hydration — never invent a confirmed loadout here.
  const confirmed = loadout.confirmedLoadout;
  const playerName = playerFacingDisplayName(loadout.displayName);
  const [eligMessage, setEligMessage] = useState<string | null>(null);
  const [eligAllowances, setEligAllowances] = useState<number | null>(null);
  const [eligLoading, setEligLoading] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState<string | null>(null);
  const activeNavGenRef = useRef(navigationGeneration);
  activeNavGenRef.current = navigationGeneration;

  const allowancesFromList = list.status === 'ready' ? list.allowancesRemaining : null;
  const allowances =
    submit.status === 'error' && submit.allowancesRemaining !== undefined
      ? submit.allowancesRemaining
      : (eligAllowances ?? allowancesFromList);
  const quotaFromList = list.status === 'ready' ? list.quota : null;
  const confirmQuota: FightQuotaSummary | null =
    quotaFromList && allowances !== null
      ? {
          ...quotaFromList,
          fightsRemaining: allowances,
          allowancesRemaining: allowances,
        }
      : quotaFromList;
  const posePair = capturePosePair();
  const captureWeaponId =
    isDesignCaptureEnabled() && peekCaptureIntent().weaponId
      ? peekCaptureIntent().weaponId!
      : confirmed?.weapon;
  const clipStill = captureWeaponId ? captureClipStill(captureWeaponId) : null;
  const nearPose: MotionPose = clipStill?.motionPose ?? posePair?.near ?? 'idle';
  const farPose: MotionPose = posePair?.far ?? 'idle';
  const nearWeaponId = captureWeaponId ?? confirmed?.weapon ?? 'sword';

  const opponentPresentation = useMemo(() => {
    if (!selected) return null;
    return resolveOpponentPresentation({
      characterId: selected.characterId,
      displayName: selected.displayName,
      paintId: selected.loadout.paint,
      weaponId: selected.loadout.weapon,
    });
  }, [selected]);

  const opponentPanelArt = useMemo(() => {
    if (!selected || !opponentPresentation) return null;
    return resolveA6OpponentPanel({
      characterId: selected.characterId,
      displayName: selected.displayName,
      paintId: opponentPresentation.paintId,
      weaponId: opponentPresentation.weaponId,
    });
  }, [selected, opponentPresentation]);

  const tapeRows = useMemo(() => {
    if (!confirmed || !selected || !opponentPresentation) return [];
    // Design-capture stills share Result overlay fixture W–L / streak / level
    // (same pack as FightResultSlot) so ToTT is reviewable. Live path still
    // hides ranking rows until OpponentCandidate/join lands — never MOCK HP.
    const captureYou = isDesignCaptureEnabled() ? designCaptureTapeStats('victory') : null;
    const captureThem = isDesignCaptureEnabled() ? designCaptureTapeStats('defeat') : null;
    return buildTapeRows({
      playerPaint: confirmed.paint,
      playerWeapon: confirmed.weapon,
      opponentPaint: opponentPresentation.paintId,
      opponentWeapon: opponentPresentation.weaponId,
      playerRecord: captureYou?.record ?? null,
      opponentRecord: captureThem?.record ?? null,
      playerWinStreak: captureYou?.winStreak ?? null,
      opponentWinStreak: captureThem?.winStreak ?? null,
      playerLevel: captureYou?.level ?? null,
      opponentLevel: captureThem?.level ?? null,
      weaponLabel: weaponDisplayLabel,
      paintLabel: paintDisplayLabel,
    });
  }, [confirmed, selected, opponentPresentation]);

  useEffect(() => {
    let cancelled = false;
    async function refreshEligibility() {
      if (!session || !selected) return;
      // Skip new-fight eligibility gate when recovering a retained same-opponent key —
      // Edge lookup-before-eligibility is authoritative for that path.
      const recovering =
        pendingIntent !== null && pendingIntent.opponentId === selected.characterId;
      if (recovering) {
        setEligLoading(false);
        setEligMessage(null);
        return;
      }
      setEligLoading(true);
      const result = await prepareEligibility();
      if (cancelled) return;
      setEligLoading(false);
      if (!result) return;
      if (!result.ok) {
        setEligMessage(result.message);
        if (typeof result.allowancesRemaining === 'number') {
          setEligAllowances(result.allowancesRemaining);
        } else if (result.code === 'allowance_exhausted') {
          setEligAllowances(0);
        }
        return;
      }
      setEligMessage(null);
      setEligAllowances(result.allowancesRemaining);
    }
    void refreshEligibility();
    return () => {
      cancelled = true;
    };
  }, [session, selected, prepareEligibility, pendingIntent]);

  if (!selected) {
    return (
      <ScreenChrome
        testID="slot-confirm"
        footer={
          <PrimaryButton
            label="Back"
            onPress={() => {
              uiAudio.playCue('uiBack');
              props.onBack();
            }}
            testID="confirm-back"
          />
        }
      >
        <ScreenHeader title="Confirm Fight" onBack={props.onBack} />
        <StatusErrorBanner
          title="No opponent selected"
          detail="Pick an opponent before confirming a fight."
          testID="confirm-missing-opponent"
        />
      </ScreenChrome>
    );
  }

  const submitting = submit.status === 'submitting' || fightInFlight;
  const controls = computeConfirmFightControls({
    canProgress,
    hasConfirmedLoadout: confirmed !== null,
    submitting,
    sessionPresent: !!session,
    allowances,
    submitStatus: submit.status,
    submitCode: submit.status === 'error' ? submit.code : null,
    pendingIntent,
    selectedOpponentId: selected.characterId,
  });
  const noAllowance = allowances !== null && allowances < 1 && !controls.recoverable;
  const submitFailure =
    submit.status === 'error'
      ? classifySessionFailure({
          code: submit.code,
          message: submit.message,
        })
      : null;
  const failureKind =
    forced ??
    (submitFailure === 'offline' || submitFailure === 'auth_expired' ? submitFailure : null);
  const allowanceError =
    submit.status === 'error' && submit.code === 'allowance_exhausted' && !controls.recoverable;
  const otherError =
    submit.status === 'error' && failureKind === null && !allowanceError ? submit : null;
  const { startDisabled, showRetry, retryDisabled, recoverable } = controls;
  const opponentName = playerFacingDisplayName(selected.displayName);

  const runStart = () => {
    clearSubmitError();
    setPlaybackBlocked(null);
    const expectedOpponentId = selected.characterId;
    const genAtStart = navigationGeneration;
    void startFight().then((fight) => {
      if (
        shouldAcceptFightNavigation({
          fight,
          expectedOpponentId,
          navigationGeneration: genAtStart,
          activeNavigationGeneration: activeNavGenRef.current,
        })
      ) {
        props.onFightStarted();
        return;
      }
      // Fight returned but cannot drive first-run Replay (DEV scaffold / unsealed).
      if (fight && fight.opponentId === expectedOpponentId && !isServerPlaybackReady(fight)) {
        setPlaybackBlocked(
          fightKind === 'dev' || fightKind === 'unavailable'
            ? 'Live combat-v1 is required for first-run Replay. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY — DEV scaffold is not a sealed server fight.'
            : 'Fight response was not a sealed combat-v1 replay with garage sealed builds. Replay stayed blocked so fixture robots and sample XP cannot appear.',
        );
      }
    });
  };

  const onBack = () => {
    if (submitting) return; // prevent Back → pick B while A is in flight
    uiAudio.playCue('uiBack');
    bumpNavigationGeneration();
    props.onBack();
  };

  return (
    <ScreenChrome
      testID="slot-confirm"
      footer={
        <>
          {eligLoading ? (
            <View style={styles.eligRow}>
              <ActivityIndicator color={garageTag.mustard} />
              <Text style={styles.eligText}>Checking eligibility…</Text>
            </View>
          ) : confirmQuota ? (
            <FightsRemainingPanel
              quota={confirmQuota}
              compact
              testID="confirm-fights-remaining"
              onRefillDue={() => {
                void refreshCandidates();
              }}
            />
          ) : (
            <Text style={styles.eligText} allowFontScaling testID="confirm-cost">
              Fights remaining: waiting for server…
              {candidatesKind === 'dev' ? ' · DEV' : ''}
            </Text>
          )}
          <PrimaryButton
            label={submitting ? 'Starting…' : recoverable ? 'Recover fight' : 'Start fight'}
            disabled={startDisabled}
            onPress={() => {
              uiAudio.playCue('uiConfirm');
              runStart();
            }}
            onDisabledPress={() => uiAudio.playCue('uiError')}
            testID="confirm-start"
          />
          {showRetry || failureKind ? (
            <PrimaryButton
              label={failureKind ? sessionFailureCopy(failureKind).actionLabel : 'Retry'}
              disabled={retryDisabled && failureKind !== 'auth_expired'}
              onPress={() => {
                uiAudio.playUiTap();
                if (failureKind === 'auth_expired') {
                  void signOut();
                  return;
                }
                runStart();
              }}
              onDisabledPress={() => uiAudio.playCue('uiError')}
              testID="confirm-retry"
            />
          ) : null}
        </>
      }
    >
      <ScreenHeader title="Tale of the Tape" onBack={onBack} />

      {!confirmed || !canProgress ? (
        <StatusErrorBanner
          title="Equipped loadout unavailable"
          detail={
            loadout.lastError ??
            'Server-confirmed loadout is required before starting a fight (F8 hydration).'
          }
          testID="confirm-hydration-blocked"
        />
      ) : (
        <View style={styles.tott} testID="confirm-tott">
          <View style={styles.faceOff} testID="confirm-fighters">
            <View style={styles.near} testID="confirm-fighter-you">
              <BotAssemblerSlot
                loadout={{
                  chassisId: confirmed.chassis,
                  paintId: confirmed.paint,
                  weaponId: nearWeaponId,
                }}
                facing="right"
                paintId={confirmed.paint}
                weaponId={nearWeaponId}
                size={150}
                reducedMotion
                motionPose={nearPose}
                {...(clipStill?.poseOverride ? { poseOverride: clipStill.poseOverride } : {})}
                {...(clipStill?.smearOverlay ? { smearOverlay: clipStill.smearOverlay } : {})}
                label="You"
                testID="confirm-you"
              />
              <Nameplate name={playerName} badge="You" />
            </View>
            <Text style={styles.vs} allowFontScaling>
              VS
            </Text>
            <View style={styles.far} testID="confirm-fighter-opponent">
              {opponentPanelArt ? (
                <Image
                  source={opponentPanelArt}
                  style={styles.opponentPanelArt}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                  testID="confirm-opponent-a6-panel"
                />
              ) : (
                <BotAssemblerSlot
                  loadout={{
                    chassisId: selected.loadout.chassis,
                    paintId: opponentPresentation?.paintId ?? selected.loadout.paint,
                    weaponId: opponentPresentation?.weaponId ?? selected.loadout.weapon,
                  }}
                  facing="left"
                  paintId={opponentPresentation?.paintId ?? selected.loadout.paint}
                  weaponId={opponentPresentation?.weaponId ?? selected.loadout.weapon}
                  size={150}
                  reducedMotion
                  motionPose={farPose}
                  label={opponentName}
                  testID="confirm-opponent"
                />
              )}
              <Nameplate name={opponentName} />
            </View>
          </View>

          <View style={styles.tape} testID="confirm-tape">
            <View style={styles.tapeHeader}>
              <Text style={styles.tapeHeadYou} allowFontScaling numberOfLines={1}>
                You
              </Text>
              <Text style={styles.tapeHeadLabel} allowFontScaling>
                {' '}
              </Text>
              <Text style={styles.tapeHeadThem} allowFontScaling numberOfLines={1}>
                Them
              </Text>
            </View>
            {tapeRows.map((row) => (
              <View key={row.label} style={styles.tapeRow} testID={`confirm-tape-${row.label}`}>
                <Text style={styles.tapeYou} allowFontScaling numberOfLines={1}>
                  {row.you}
                </Text>
                <Text style={styles.tapeLabel} allowFontScaling numberOfLines={1}>
                  {row.label}
                </Text>
                <Text style={styles.tapeThem} allowFontScaling numberOfLines={1}>
                  {row.them}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {recoverable && (allowances === null || allowances < 1) ? (
        <StatusErrorBanner
          title="Recover previous fight"
          detail="A fight may already be committed for this opponent. Start/Retry reuses the same idempotency key — it will not spend another slot."
          testID="confirm-recover-intent"
        />
      ) : null}

      {noAllowance || allowanceError ? (
        <StatusErrorBanner
          title="No fights remaining"
          detail="The server reports zero remaining fights. No fight was started."
          testID="confirm-no-allowance"
        />
      ) : null}

      {failureKind ? (
        <SessionFailureBanner
          kind={failureKind}
          {...(submit.status === 'error' ? { detail: submit.message } : {})}
          testID={`confirm-session-${failureKind}`}
        />
      ) : null}

      {otherError ? (
        <StatusErrorBanner
          title="Fight request failed"
          detail={otherError.message}
          testID="confirm-error"
        />
      ) : null}

      {eligMessage && !allowanceError && !noAllowance ? (
        <StatusErrorBanner
          title="Not eligible"
          detail={eligMessage}
          testID="confirm-eligibility-error"
        />
      ) : null}

      {playbackBlocked ? (
        <StatusErrorBanner
          title="Server fight required"
          detail={playbackBlocked}
          testID="confirm-playback-blocked"
        />
      ) : null}

      {fightKind === 'unavailable' || candidatesKind === 'unavailable' ? (
        <StatusErrorBanner
          title="Backend required"
          detail="EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set. DEV fight scaffolds are not used on playable builds."
          testID="confirm-misconfigured"
        />
      ) : null}
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  tott: {
    width: '100%',
    gap: 12,
  },
  faceOff: {
    width: '100%',
    minHeight: 260,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: garageTag.paper,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    paddingHorizontal: 8,
    paddingBottom: 10,
    paddingTop: 12,
  },
  near: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    zIndex: 2,
  },
  far: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    zIndex: 1,
  },
  /** Same A6 panel art source/size as Opponents card (shared resolver). */
  opponentPanelArt: {
    width: 150,
    height: 150,
  },
  vs: {
    alignSelf: 'center',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 1.2,
    color: garageTag.graphite,
    paddingHorizontal: 4,
    paddingBottom: 48,
  },
  tape: {
    width: '100%',
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.white,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
  },
  tapeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  tapeHeadYou: {
    flex: 1,
    textAlign: 'left',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: garageTag.steel,
  },
  tapeHeadLabel: {
    width: 88,
  },
  tapeHeadThem: {
    flex: 1,
    textAlign: 'right',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: garageTag.steel,
  },
  tapeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
  },
  tapeYou: {
    flex: 1,
    textAlign: 'left',
    fontWeight: '800',
    fontSize: 14,
    color: garageTag.graphite,
  },
  tapeLabel: {
    width: 88,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.steel,
  },
  tapeThem: {
    flex: 1,
    textAlign: 'right',
    fontWeight: '800',
    fontSize: 14,
    color: garageTag.graphite,
  },
  eligText: {
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  eligRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
