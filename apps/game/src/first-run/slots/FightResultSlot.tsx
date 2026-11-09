import React, { useMemo } from 'react';
import {
  PrimaryButton,
  SecondaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
} from '../../garage-tag';
import { useFightSession } from '../../fight';
import { FightResultContent } from '../../replay/FightResultContent';
import { resolveFirstRunConfirmedResult } from '../../replay/resolveSessionResult';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/**
 * Shell FightResult slot — Garage Tag chrome owns the frame.
 * Progression XP / allowances only from server-confirmed combat-v1 — never REF samples.
 */
export function FightResultSlot(): React.ReactElement {
  const { goTo, goNext, goBack } = useFirstRun();
  const { lastFight, fightKind } = useFightSession();

  const resolution = useMemo(() => resolveFirstRunConfirmedResult(lastFight), [lastFight]);

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
        <DomainNote
          text={
            fightKind === 'dev'
              ? 'Domain: F10 · blocked — XP/cost stay withheld until a live combat-v1 fight.'
              : `Domain: F10 · blocked (${resolution.reason}) — no sample XP.`
          }
        />
      </ScreenChrome>
    );
  }

  const confirmed = resolution.confirmed;

  return (
    <ScreenChrome
      testID="slot-result"
      footer={
        <>
          <PrimaryButton
            label="Back to stable"
            onPress={() => goTo('Stable')}
            testID="result-stable"
          />
          <SecondaryButton
            label="Watch again"
            onPress={() => goTo('Replay')}
            testID="result-watch"
          />
          <SecondaryButton label="Ranking" onPress={goNext} testID="result-ranking" />
        </>
      }
    >
      <ScreenHeader title="Fight Result" />
      <FightResultContent confirmed={confirmed} testID="fight-result" />
      <DomainNote text="Domain: F10 fight result — XP and allowances from combat-v1 only. Never invent REF samples." />
    </ScreenChrome>
  );
}
