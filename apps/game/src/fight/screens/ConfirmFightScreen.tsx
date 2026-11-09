import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import {
  KitArtPlaceholder,
  Nameplate,
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';
import { isStartFightDisabled, shouldAcceptFightNavigation } from '../fightSessionLifecycle';
import { useFightSession } from '../FightSessionContext';

/** ConfirmFight domain — mounts into shell ConfirmFight slot; starts combat-v1. */
export function ConfirmFightScreen(props: {
  onBack: () => void;
  onFightStarted: () => void;
}): React.ReactElement {
  const { loadout, session, canProgress } = useGarageSession();
  const {
    selected,
    submit,
    list,
    startFight,
    clearSubmitError,
    candidatesKind,
    prepareEligibility,
    fightInFlight,
    bumpNavigationGeneration,
    navigationGeneration,
  } = useFightSession();
  // Inherit F8 hydration — never invent a confirmed loadout here.
  const confirmed = loadout.confirmedLoadout;
  const playerName = loadout.displayName ?? 'Pilot';
  const [eligMessage, setEligMessage] = useState<string | null>(null);
  const [eligAllowances, setEligAllowances] = useState<number | null>(null);
  const [eligLoading, setEligLoading] = useState(false);
  const activeNavGenRef = useRef(navigationGeneration);
  activeNavGenRef.current = navigationGeneration;

  const allowancesFromList = list.status === 'ready' ? list.allowancesRemaining : null;
  const allowances =
    submit.status === 'error' && submit.allowancesRemaining !== undefined
      ? submit.allowancesRemaining
      : (eligAllowances ?? allowancesFromList);

  useEffect(() => {
    let cancelled = false;
    async function refreshEligibility() {
      if (!session || !selected) return;
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
  }, [session, selected, prepareEligibility]);

  if (!selected) {
    return (
      <ScreenChrome
        testID="slot-confirm"
        footer={<PrimaryButton label="Back" onPress={props.onBack} testID="confirm-back" />}
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
  const noAllowance = allowances !== null && allowances < 1;
  const networkError = submit.status === 'error' && submit.code === 'network_error';
  const allowanceError = submit.status === 'error' && submit.code === 'allowance_exhausted';
  const otherError = submit.status === 'error' && !networkError && !allowanceError ? submit : null;
  const startDisabled =
    !canProgress ||
    confirmed === null ||
    isStartFightDisabled({
      submitting,
      sessionPresent: !!session,
      allowances,
      submitCode: submit.status === 'error' ? submit.code : null,
    });

  const runStart = () => {
    clearSubmitError();
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
      }
    });
  };

  const onBack = () => {
    if (submitting) return; // prevent Back → pick B while A is in flight
    bumpNavigationGeneration();
    props.onBack();
  };

  return (
    <ScreenChrome
      testID="slot-confirm"
      footer={
        <>
          <PrimaryButton
            label={submitting ? 'Starting…' : 'Start fight'}
            disabled={startDisabled}
            onPress={runStart}
            testID="confirm-start"
          />
          {(networkError || otherError) && (
            <PrimaryButton
              label="Retry"
              disabled={submitting || startDisabled}
              onPress={runStart}
              testID="confirm-retry"
            />
          )}
        </>
      }
    >
      <ScreenHeader title="Confirm Fight" onBack={onBack} />

      <KitArtPlaceholder
        label="Repair Yard (static)"
        detail="PLACEHOLDER — F10 owns layered arena + FX. Static preview only."
        style={styles.arena}
        testID="confirm-arena"
      />

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
        <View style={styles.fighters}>
          <View style={styles.fighter}>
            <View style={styles.botFrame}>
              <BotAssemblerSlot
                loadout={{
                  chassisId: confirmed.chassis,
                  paintId: confirmed.paint,
                  weaponId: confirmed.weapon,
                }}
                facing="right"
                size={132}
                reducedMotion
                label="You"
                testID="confirm-you"
              />
            </View>
            <Nameplate name={playerName} badge="You" />
          </View>
          <View style={styles.fighter}>
            <View style={[styles.botFrame, styles.botFar]}>
              <BotAssemblerSlot
                loadout={{
                  chassisId: selected.loadout.chassis,
                  paintId: selected.loadout.paint,
                  weaponId: selected.loadout.weapon,
                }}
                facing="left"
                size={118}
                reducedMotion
                label={selected.displayName}
                testID="confirm-opponent"
              />
            </View>
            <Nameplate name={selected.displayName} />
          </View>
        </View>
      )}

      {eligLoading ? (
        <View style={styles.eligRow}>
          <ActivityIndicator color={garageTag.mustard} />
          <Text style={styles.cost}>Checking eligibility…</Text>
        </View>
      ) : (
        <Text style={styles.cost} allowFontScaling testID="confirm-cost">
          {allowances === null
            ? 'Allowance: waiting for server…'
            : `Uses 1 fight slot · ${allowances} remaining today`}
          {candidatesKind === 'dev' ? ' · DEV' : ''}
        </Text>
      )}

      {noAllowance || allowanceError ? (
        <StatusErrorBanner
          title="No fight allowance left"
          detail="The server reports zero remaining slots for today. No fight was started."
          testID="confirm-no-allowance"
        />
      ) : null}

      {networkError ? (
        <StatusErrorBanner
          title="Network failure"
          detail={submit.status === 'error' ? submit.message : 'Could not reach combat-v1.'}
          testID="confirm-network-error"
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

      <Text style={styles.note} allowFontScaling>
        XP and outcomes come from combat-v1 after the request — not from REF samples.
      </Text>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  arena: {
    minHeight: 96,
  },
  fighters: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  fighter: {
    flex: 1,
    gap: 8,
    alignItems: 'center',
  },
  botFrame: {
    width: 132,
    height: 150,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  botFar: {
    width: 118,
    height: 136,
    opacity: 0.96,
  },
  cost: {
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
  note: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: garageTag.steel,
  },
});
