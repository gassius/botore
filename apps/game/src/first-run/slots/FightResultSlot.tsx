import React, { useMemo } from 'react';
import { PrimaryButton, SecondaryButton, ScreenChrome, ScreenHeader } from '../../garage-tag';
import { useFightSession } from '../../fight';
import { FightResultContent } from '../../replay/FightResultContent';
import { resolveSessionConfirmedResult } from '../../replay/resolveSessionResult';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/**
 * Shell FightResult slot — Garage Tag chrome owns the frame.
 * Domain progression content mounts inside; no charcoal duplicate shell.
 */
export function FightResultSlot(): React.ReactElement {
  const { goTo, goNext } = useFirstRun();
  const { lastFight } = useFightSession();

  const confirmed = useMemo(() => resolveSessionConfirmedResult(lastFight), [lastFight]);

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
      <DomainNote text="Domain: F10 fight result. Never invent XP from REF samples or art." />
    </ScreenChrome>
  );
}
