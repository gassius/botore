import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MotionPose } from '../../assembler';
import { HEAVIEST_SHAPES, shapePartId } from '../../assembler/shapes';
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
  GlyphButton,
  Nameplate,
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
  garageTag,
  uiKitAssets,
} from '../../garage-tag';
import { resolveOpponentPresentation } from '../../garage-tag/a6OpponentPresentation';
import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { isServerPlaybackReady } from '../../replay/serverPlayback';
import { classifySessionFailure, sessionFailureCopy } from '../../session-failure';
import { SessionFailureBanner } from '../../session-failure/SessionFailureBanner';
import { useForcedSessionFailure } from '../../session-failure/useForcedSessionFailure';
import { CONFIRM_FACE_OFF, confirmFaceOffKitTop, confirmFaceOffScale } from '../confirmFaceOff';
import { computeConfirmFightControls, shouldAcceptFightNavigation } from '../fightSessionLifecycle';
import { useFightSession } from '../FightSessionContext';
import { FightsRemainingPanel } from '../quota/FightsRemainingPanel';
import type { FightQuotaSummary } from '../quota/fightQuotaTypes';
import { useDesignCaptureFightQuota } from '../quota/useDesignCaptureFightQuota';
import { buildTapeRows, designCaptureTapeStats, formatTapeRecord } from '../taleOfTheTape';

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

/** Design-capture heaviest A4 combo for clipping evidence stills. */
function captureHeaviestShapes(): {
  head: string;
  body: string;
  arms: string;
  legs: string;
} | null {
  if (!isDesignCaptureEnabled()) return null;
  const scenario = peekCaptureIntent().customiseScenario;
  if (scenario !== 'shape-heaviest' && scenario !== 'shape-equipped') return null;
  return {
    head: shapePartId('head', HEAVIEST_SHAPES.head),
    body: shapePartId('body', HEAVIEST_SHAPES.body),
    arms: shapePartId('arms', HEAVIEST_SHAPES.arms),
    legs: shapePartId('legs', HEAVIEST_SHAPES.legs),
  };
}

/** Confirm Fight face-off — starts combat-v1. */
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
  const playerBotoreName =
    typeof loadout.botoreName === 'string' && loadout.botoreName.trim().length > 0
      ? playerFacingDisplayName(loadout.botoreName)
      : null;
  const [eligMessage, setEligMessage] = useState<string | null>(null);
  const [eligAllowances, setEligAllowances] = useState<number | null>(null);
  const [eligLoading, setEligLoading] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState<string | null>(null);
  const activeNavGenRef = useRef(navigationGeneration);
  activeNavGenRef.current = navigationGeneration;

  const { displayAllowancesRemaining, displayQuota } = useDesignCaptureFightQuota(list);
  // Design-capture fightQuota=exhausted/remaining must win over prepareEligibility
  // so Confirm 0-fights stills are not stuck on the live 3/3 Full panel.
  const allowancesFromList =
    displayAllowancesRemaining ?? (list.status === 'ready' ? list.allowancesRemaining : null);
  const allowances =
    submit.status === 'error' && submit.allowancesRemaining !== undefined
      ? submit.allowancesRemaining
      : (displayAllowancesRemaining ?? eligAllowances ?? allowancesFromList);
  const quotaFromList = displayQuota ?? (list.status === 'ready' ? list.quota : null);
  const confirmQuota: FightQuotaSummary | null =
    displayQuota && displayAllowancesRemaining !== null
      ? {
          ...displayQuota,
          fightsRemaining: displayAllowancesRemaining,
          allowancesRemaining: displayAllowancesRemaining,
        }
      : quotaFromList && allowances !== null
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
  const heaviest = captureHeaviestShapes();

  const opponentPresentation = useMemo(() => {
    if (!selected) return null;
    return resolveOpponentPresentation({
      characterId: selected.characterId,
      displayName: selected.displayName,
      paintId: selected.loadout.paint,
      weaponId: selected.loadout.weapon,
    });
  }, [selected]);

  const tapeRows = useMemo(() => {
    if (!confirmed || !selected || !opponentPresentation) return [];
    // YOU: design-capture stills share Result overlay fixture W–L / streak / level.
    // THEM Record must match the Opponents card — same candidate wins/losses
    // (never the defeat Result fixture 11W–7L). Streak/level stay capture-only
    // until ranking join lands. Never MOCK HP.
    const captureYou = isDesignCaptureEnabled() ? designCaptureTapeStats('victory') : null;
    const captureThem = isDesignCaptureEnabled() ? designCaptureTapeStats('defeat') : null;
    const hasRosterRecord =
      typeof selected.wins === 'number' &&
      Number.isFinite(selected.wins) &&
      typeof selected.losses === 'number' &&
      Number.isFinite(selected.losses);
    const opponentRecord = hasRosterRecord
      ? formatTapeRecord(selected.wins!, selected.losses!)
      : null;
    return buildTapeRows({
      playerPaint: confirmed.paint,
      playerWeapon: confirmed.weapon,
      opponentPaint: opponentPresentation.paintId,
      opponentWeapon: opponentPresentation.weaponId,
      playerRecord: captureYou?.record ?? null,
      opponentRecord,
      playerWinStreak: captureYou?.winStreak ?? null,
      opponentWinStreak: captureThem?.winStreak ?? null,
      playerLevel: captureYou?.level ?? null,
      opponentLevel: captureThem?.level ?? null,
      weaponLabel: weaponDisplayLabel,
      paintLabel: paintDisplayLabel,
      opponentWeaponLabel: opponentPresentation.weaponLabel,
      opponentPaintLabel: opponentPresentation.paintLabel,
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
  const opponentBotoreName =
    typeof selected.botoreName === 'string' && selected.botoreName.trim().length > 0
      ? playerFacingDisplayName(selected.botoreName)
      : null;

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

  const playerShapes = {
    head: heaviest?.head ?? confirmed?.head ?? null,
    body: heaviest?.body ?? confirmed?.body ?? null,
    arms: heaviest?.arms ?? confirmed?.arms ?? null,
    legs: heaviest?.legs ?? confirmed?.legs ?? null,
  };

  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top', 'left', 'right', 'bottom']}
      testID="slot-confirm"
    >
      <View style={styles.column}>
        <View style={styles.faceOffBand} testID="confirm-fighters">
          <View style={styles.wall} />
          <View style={styles.floor} />
          <View style={styles.groundLine} />
          <GlyphButton
            source={uiKitAssets.glyphBack}
            accessibilityLabel="Back"
            onPress={onBack}
            style={styles.backFab}
            testID="confirm-back-fab"
          />
          <Text style={styles.vs} allowFontScaling accessibilityRole="text">
            VS
          </Text>
          {confirmed && canProgress ? (
            <>
              <View
                style={[
                  styles.botMount,
                  styles.botNear,
                  { left: CONFIRM_FACE_OFF.leftCenterX - CONFIRM_FACE_OFF.bodySize / 2 },
                ]}
                testID="confirm-fighter-you"
              >
                <View style={styles.contactShadow} />
                <BotAssemblerSlot
                  loadout={{
                    chassisId: confirmed.chassis,
                    paintId: confirmed.paint,
                    weaponId: nearWeaponId,
                    head: playerShapes.head,
                    body: playerShapes.body,
                    arms: playerShapes.arms,
                    legs: playerShapes.legs,
                  }}
                  facing="right"
                  paintId={confirmed.paint}
                  weaponId={nearWeaponId}
                  size={CONFIRM_FACE_OFF.bodySize}
                  reducedMotion
                  motionPose={nearPose}
                  {...(clipStill?.poseOverride ? { poseOverride: clipStill.poseOverride } : {})}
                  {...(clipStill?.smearOverlay ? { smearOverlay: clipStill.smearOverlay } : {})}
                  label="You"
                  testID="confirm-you"
                />
              </View>
              <View
                style={[
                  styles.botMount,
                  styles.botFar,
                  { left: CONFIRM_FACE_OFF.rightCenterX - CONFIRM_FACE_OFF.bodySize / 2 },
                ]}
                testID="confirm-fighter-opponent"
              >
                <View style={styles.contactShadow} />
                <BotAssemblerSlot
                  loadout={{
                    chassisId: selected.loadout.chassis,
                    paintId: opponentPresentation?.paintId ?? selected.loadout.paint,
                    weaponId: opponentPresentation?.weaponId ?? selected.loadout.weapon,
                    head: selected.loadout.head,
                    body: selected.loadout.body,
                    arms: selected.loadout.arms,
                    legs: selected.loadout.legs,
                  }}
                  facing="left"
                  paintId={opponentPresentation?.paintId ?? selected.loadout.paint}
                  weaponId={opponentPresentation?.weaponId ?? selected.loadout.weapon}
                  size={CONFIRM_FACE_OFF.bodySize}
                  reducedMotion
                  motionPose={farPose}
                  label={opponentName}
                  testID="confirm-opponent"
                />
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.bandRule} />

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
          <View style={styles.belowBand} testID="confirm-tott">
            <View style={styles.namePlates} testID="confirm-nameplates">
              <Nameplate
                name={playerName}
                {...(playerBotoreName ? { subtitle: playerBotoreName } : {})}
                oxideRim
                style={styles.plate}
                testID="confirm-nameplate-you"
              />
              <Nameplate
                name={opponentName}
                {...(opponentBotoreName ? { subtitle: opponentBotoreName } : {})}
                style={styles.plate}
                testID="confirm-nameplate-opponent"
              />
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

        <View style={styles.footer}>
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
          {/* B3: exhausted copy stays above START FIGHT — never over the tape table. */}
          {noAllowance || allowanceError ? (
            <Text style={styles.zeroFightsHint} testID="confirm-no-allowance" allowFontScaling>
              No fights remaining
            </Text>
          ) : null}
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
  column: {
    flex: 1,
  },
  faceOffBand: {
    width: '100%',
    height: CONFIRM_FACE_OFF.bandHeight,
    overflow: 'visible',
    backgroundColor: '#3F463C',
  },
  wall: {
    ...StyleSheet.absoluteFillObject,
    bottom: '40%',
    backgroundColor: '#59604F',
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
    backgroundColor: '#CBB48A',
  },
  groundLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: CONFIRM_FACE_OFF.groundY,
    height: 2,
    backgroundColor: '#9C8660',
  },
  backFab: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 20,
    backgroundColor: garageTag.cream,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: 8,
  },
  vs: {
    position: 'absolute',
    top: CONFIRM_FACE_OFF.vsCenterY - 28,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 46,
    fontStyle: 'italic',
    letterSpacing: 2,
    color: garageTag.mustard,
    zIndex: 15,
    textShadowColor: garageTag.graphite,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  botMount: {
    position: 'absolute',
    // Plant kit ground_y on the shared ground line (not canvas bottom — that
    // leaves ~145 rig px / ~50+ pt of empty padding under the soles).
    top: confirmFaceOffKitTop(),
    width: CONFIRM_FACE_OFF.bodySize,
    height: CONFIRM_FACE_OFF.bodySize,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  botNear: {
    zIndex: 3,
  },
  botFar: {
    zIndex: 2,
  },
  contactShadow: {
    position: 'absolute',
    // Under the soles: kitGroundY from canvas top, slightly below the line.
    top: CONFIRM_FACE_OFF.kitGroundY * confirmFaceOffScale() - 4,
    width: CONFIRM_FACE_OFF.bodySize * 0.55,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(26, 30, 34, 0.28)',
    zIndex: 0,
  },
  zeroFightsHint: {
    marginHorizontal: 12,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
    color: garageTag.steel,
  },
  bandRule: {
    height: 4,
    width: '100%',
    backgroundColor: garageTag.graphite,
  },
  belowBand: {
    width: '100%',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
    flexShrink: 1,
  },
  namePlates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  plate: {
    width: CONFIRM_FACE_OFF.plateWidth,
    minHeight: CONFIRM_FACE_OFF.plateHeight,
    alignSelf: 'flex-start',
  },
  tape: {
    width: '100%',
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.white,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 2,
  },
  tapeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
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
    minHeight: 26,
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
  footer: {
    marginTop: 'auto',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
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
