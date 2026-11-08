import React, { useEffect, useState } from 'react';
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
import { useFightSession } from '../FightSessionContext';

/** ConfirmFight domain — mounts into shell ConfirmFight slot; starts combat-v1. */
export function ConfirmFightScreen(props: {
  onBack: () => void;
  onFightStarted: () => void;
}): React.ReactElement {
  const { loadout, session } = useGarageSession();
  const {
    selected,
    submit,
    list,
    startFight,
    clearSubmitError,
    candidatesKind,
    prepareEligibility,
  } = useFightSession();
  const confirmed = loadout.confirmedLoadout;
  const [eligMessage, setEligMessage] = useState<string | null>(null);
  const [eligAllowances, setEligAllowances] = useState<number | null>(null);
  const [eligLoading, setEligLoading] = useState(false);

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

  const submitting = submit.status === 'submitting';
  const noAllowance = allowances !== null && allowances < 1;
  const networkError = submit.status === 'error' && submit.code === 'network_error';
  const allowanceError = submit.status === 'error' && submit.code === 'allowance_exhausted';
  const otherError = submit.status === 'error' && !networkError && !allowanceError ? submit : null;

  return (
    <ScreenChrome
      testID="slot-confirm"
      footer={
        <>
          <PrimaryButton
            label={submitting ? 'Starting…' : 'Start fight'}
            disabled={submitting || noAllowance || !session}
            onPress={() => {
              clearSubmitError();
              void startFight().then((fight) => {
                if (fight) props.onFightStarted();
              });
            }}
            testID="confirm-start"
          />
          {(networkError || otherError) && (
            <PrimaryButton
              label="Retry"
              disabled={submitting}
              onPress={() => {
                clearSubmitError();
                void startFight().then((fight) => {
                  if (fight) props.onFightStarted();
                });
              }}
              testID="confirm-retry"
            />
          )}
        </>
      }
    >
      <ScreenHeader title="Confirm Fight" onBack={props.onBack} />

      <KitArtPlaceholder
        label="Repair Yard (static)"
        detail="PLACEHOLDER — F10 owns layered arena + FX. Static preview only."
        testID="confirm-arena"
      />

      <View style={styles.fighters}>
        <View style={styles.fighter}>
          <BotAssemblerSlot
            loadout={{
              chassisId: confirmed.chassis,
              paintId: confirmed.paint,
              weaponId: confirmed.weapon,
            }}
            facing="right"
            stagger="near-low"
            label="You"
            style={styles.bot}
            testID="confirm-you"
          />
          <Nameplate name="Player Hero" badge="You" />
        </View>
        <View style={styles.fighter}>
          <BotAssemblerSlot
            loadout={{
              chassisId: selected.loadout.chassis,
              paintId: selected.loadout.paint,
              weaponId: selected.loadout.weapon,
            }}
            facing="left"
            stagger="far-high"
            label={selected.displayName}
            style={styles.bot}
            testID="confirm-opponent"
          />
          <Nameplate name={selected.displayName} />
        </View>
      </View>

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
  fighters: {
    flexDirection: 'row',
    gap: 8,
  },
  fighter: {
    flex: 1,
    gap: 8,
  },
  bot: {
    minHeight: 140,
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
