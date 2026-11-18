import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import type { MotionPose } from '../../assembler';
import type { KitPoseEntry, KitWeaponKind } from '../../assembler/workshopFrameTypes';
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
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import {
  GlyphButton,
  PrimaryButton,
  ScreenChrome,
  StatusErrorBanner,
  garageTag,
  uiKitAssets,
} from '../../garage-tag';
import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { isServerPlaybackReady } from '../../replay/serverPlayback';
import { classifySessionFailure, sessionFailureCopy } from '../../session-failure';
import { SessionFailureBanner } from '../../session-failure/SessionFailureBanner';
import { useForcedSessionFailure } from '../../session-failure/useForcedSessionFailure';
import { computeConfirmFightControls, shouldAcceptFightNavigation } from '../fightSessionLifecycle';
import { useFightSession } from '../FightSessionContext';
import { FightsRemainingPanel } from '../quota/FightsRemainingPanel';
import type { FightQuotaSummary } from '../quota/fightQuotaTypes';
import { A6_FACEOFF, resolveA6FaceOffLayer } from '../tale/a6FaceOffAssets';
import { buildTaleOfTheTapeRows } from '../tale/tapeRows';

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
  const id = weaponId.toLowerCase();
  if (id.includes('axe')) return 'axe';
  if (id.includes('dagger')) return 'dagger';
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

  const bakedFaceOff =
    confirmed && selected
      ? resolveA6FaceOffLayer(
          { paintId: confirmed.paint, weaponId: nearWeaponId },
          { paintId: selected.loadout.paint, weaponId: selected.loadout.weapon },
        )
      : null;

  // D9 tape: only real data. Weapon/Paint from loadouts; Record/W-L only when
  // ranking enriched the candidate. Never invent A6-art MOCK HP/Strength rows.
  const tapeRows = useMemo(() => {
    if (!confirmed || !selected) return [];
    return buildTaleOfTheTapeRows(
      {
        weaponId: nearWeaponId,
        paintId: confirmed.paint,
        // Player W–L / streak / level not on Confirm path yet — omit until real.
      },
      {
        weaponId: selected.loadout.weapon,
        paintId: selected.loadout.paint,
        ...(typeof selected.wins === 'number' ? { recordWins: selected.wins } : {}),
        ...(typeof selected.losses === 'number' ? { recordLosses: selected.losses } : {}),
      },
    );
  }, [confirmed, selected, nearWeaponId]);

  useEffect(() => {
    let cancelled = false;
    async function refreshEligibility() {
      if (!session || !selected) return;
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
        footer={<PrimaryButton label="Back" onPress={props.onBack} testID="confirm-back" />}
      >
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
    if (submitting) return;
    bumpNavigationGeneration();
    props.onBack();
  };

  const opponentName = playerFacingDisplayName(selected.displayName);
  const opponentBotore =
    typeof selected.botoreName === 'string' && selected.botoreName.trim().length > 0
      ? playerFacingDisplayName(selected.botoreName)
      : null;

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
            onPress={runStart}
            testID="confirm-start"
          />
          {showRetry || failureKind ? (
            <PrimaryButton
              label={failureKind ? sessionFailureCopy(failureKind).actionLabel : 'Retry'}
              disabled={retryDisabled && failureKind !== 'auth_expired'}
              onPress={() => {
                if (failureKind === 'auth_expired') {
                  void signOut();
                  return;
                }
                runStart();
              }}
              testID="confirm-retry"
            />
          ) : null}
        </>
      }
    >
      {/* D9 face-off band — A6 geometry; baked layer when combo matches, else live rig. */}
      <View style={styles.faceOff} testID="confirm-fighters">
        <View style={[styles.spot, styles.spotLeft]} />
        <View style={[styles.spot, styles.spotRight]} />
        <GlyphButton
          source={uiKitAssets.glyphBack}
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.backBtn}
          testID="confirm-back"
        />
        <View style={styles.totPlate} testID="confirm-tot-plate">
          <Text style={styles.totTitle} allowFontScaling>
            Tale of the Tape
          </Text>
        </View>

        {!canProgress || !confirmed ? (
          <StatusErrorBanner
            title="Equipped loadout unavailable"
            detail={
              loadout.lastError ??
              'Server-confirmed loadout is required before starting a fight (F8 hydration).'
            }
            testID="confirm-hydration-blocked"
          />
        ) : bakedFaceOff && !posePair && !clipStill ? (
          <Image
            source={bakedFaceOff}
            style={styles.bakedLayer}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            testID="confirm-a6-faceoff"
          />
        ) : (
          <>
            <View style={styles.nearBot} testID="confirm-fighter-you">
              <BotAssemblerSlot
                loadout={{
                  chassisId: confirmed.chassis,
                  paintId: confirmed.paint,
                  weaponId: nearWeaponId,
                }}
                facing="right"
                paintId={confirmed.paint}
                weaponId={nearWeaponId}
                size={A6_FACEOFF.bodyHeight}
                reducedMotion
                motionPose={nearPose}
                {...(clipStill?.poseOverride ? { poseOverride: clipStill.poseOverride } : {})}
                {...(clipStill?.smearOverlay ? { smearOverlay: clipStill.smearOverlay } : {})}
                testID="confirm-you"
              />
            </View>
            <View style={styles.farBot} testID="confirm-fighter-opponent">
              <BotAssemblerSlot
                loadout={{
                  chassisId: selected.loadout.chassis,
                  paintId: selected.loadout.paint,
                  weaponId: selected.loadout.weapon,
                }}
                facing="left"
                paintId={selected.loadout.paint}
                weaponId={selected.loadout.weapon}
                size={A6_FACEOFF.bodyHeight}
                reducedMotion
                motionPose={farPose}
                testID="confirm-opponent"
              />
            </View>
          </>
        )}

        <Text style={styles.vs} allowFontScaling testID="confirm-vs">
          VS
        </Text>

        <View style={styles.nameRow}>
          <View style={[styles.namePlate, styles.namePlateYou]} testID="confirm-name-you">
            <Text style={styles.nameBot} numberOfLines={1} allowFontScaling>
              {playerName}
            </Text>
            <Text style={styles.nameBotore} numberOfLines={1} allowFontScaling>
              you
            </Text>
          </View>
          <View style={[styles.namePlate, styles.namePlateOpp]} testID="confirm-name-opp">
            <Text style={styles.nameBot} numberOfLines={1} allowFontScaling>
              {opponentName}
            </Text>
            {opponentBotore ? (
              <Text style={styles.nameBotore} numberOfLines={1} allowFontScaling>
                {opponentBotore}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {tapeRows.length > 0 ? (
        <View style={styles.tape} testID="confirm-tape">
          {tapeRows.map((row) => (
            <View style={styles.tapeRow} key={row.key} testID={`confirm-tape-${row.key}`}>
              <Text
                style={[
                  styles.tapeVal,
                  styles.tapeLeft,
                  row.better === 'left' ? styles.tapeWin : null,
                ]}
                allowFontScaling
              >
                {row.left}
                {row.better === 'left' ? ' ▲' : ''}
              </Text>
              <Text style={styles.tapeLabel} allowFontScaling>
                {row.label}
              </Text>
              <Text
                style={[
                  styles.tapeVal,
                  styles.tapeRight,
                  row.better === 'right' ? styles.tapeWin : null,
                ]}
                allowFontScaling
              >
                {row.better === 'right' ? '▲ ' : ''}
                {row.right}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

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
  faceOff: {
    width: '100%',
    height: A6_FACEOFF.height,
    backgroundColor: '#3f463c',
    borderBottomWidth: 4,
    borderBottomColor: garageTag.graphite,
    overflow: 'hidden',
    marginHorizontal: -16,
    alignSelf: 'center',
  },
  spot: {
    position: 'absolute',
    top: -40,
    width: 260,
    height: 460,
  },
  spotLeft: {
    left: -40,
    backgroundColor: 'transparent',
  },
  spotRight: {
    right: -40,
    backgroundColor: 'transparent',
  },
  backBtn: {
    position: 'absolute',
    left: 10,
    top: 12,
    zIndex: 6,
  },
  totPlate: {
    position: 'absolute',
    alignSelf: 'center',
    top: 14,
    backgroundColor: garageTag.mustard,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 7,
    paddingVertical: 4,
    paddingHorizontal: 16,
    zIndex: 5,
    transform: [{ rotate: '-2deg' }],
  },
  totTitle: {
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  bakedLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: A6_FACEOFF.height,
  },
  nearBot: {
    position: 'absolute',
    left: A6_FACEOFF.leftCenterX - A6_FACEOFF.bodyHeight / 2 - 20,
    bottom: A6_FACEOFF.height - A6_FACEOFF.groundY,
    zIndex: 2,
  },
  farBot: {
    position: 'absolute',
    right: A6_FACEOFF.width - A6_FACEOFF.rightCenterX - A6_FACEOFF.bodyHeight / 2 + 20,
    bottom: A6_FACEOFF.height - A6_FACEOFF.groundY,
    zIndex: 2,
  },
  vs: {
    position: 'absolute',
    alignSelf: 'center',
    top: 170,
    fontSize: 44,
    fontWeight: '900',
    fontStyle: 'italic',
    color: garageTag.mustard,
    zIndex: 6,
    textShadowColor: garageTag.graphite,
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0,
  },
  nameRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 330,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 6,
  },
  namePlate: {
    backgroundColor: 'rgba(36,33,29,0.88)',
    borderWidth: 2.5,
    borderColor: garageTag.graphite,
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 10,
    minWidth: 150,
  },
  namePlateYou: {
    borderColor: garageTag.oxide,
  },
  namePlateOpp: {
    alignItems: 'flex-end',
  },
  nameBot: {
    color: garageTag.white,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  nameBotore: {
    color: '#d9c9ab',
    fontSize: 11.5,
    fontWeight: '600',
  },
  tape: {
    marginTop: 12,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: 9,
    backgroundColor: garageTag.white,
    overflow: 'hidden',
  },
  tapeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderBottomWidth: 2,
    borderBottomColor: '#e3d3b4',
  },
  tapeVal: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: garageTag.graphite,
    paddingHorizontal: 14,
  },
  tapeLeft: {
    textAlign: 'left',
  },
  tapeRight: {
    textAlign: 'right',
  },
  tapeWin: {
    color: garageTag.oxide,
  },
  tapeLabel: {
    flexBasis: 108,
    textAlign: 'center',
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#6b6356',
    backgroundColor: '#efe0c3',
    alignSelf: 'stretch',
    textAlignVertical: 'center',
    paddingVertical: 10,
    fontWeight: '700',
  },
  eligRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  eligText: {
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    marginBottom: 8,
  },
});
