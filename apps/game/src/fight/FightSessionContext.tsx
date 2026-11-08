import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useGarageSession } from '../garage/LoadoutSessionContext';
import { createOpponentCandidatesClient } from './candidates/createOpponentCandidatesClient';
import type { OpponentCandidatesPort } from './candidates/OpponentCandidatesPort';
import type { OpponentCandidate, PrepareEligibilityResult } from './candidates/types';
import { createFightRequestClient } from './request/createFightRequestClient';
import type { FightRequestPort } from './request/FightRequestPort';
import { resolveFightIntent, type FightIntent } from './request/idempotency';
import type { FightSuccess } from './request/types';

export type FightListState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly candidates: readonly OpponentCandidate[];
      readonly allowancesRemaining: number;
      readonly utcDay: string;
    }
  | {
      readonly status: 'error';
      readonly code: string;
      readonly message: string;
      readonly allowancesRemaining?: number;
    };

export type FightSubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly fight: FightSuccess }
  | {
      readonly status: 'error';
      readonly code: string;
      readonly message: string;
      readonly allowancesRemaining?: number;
    };

export type FightSessionContextValue = {
  readonly candidatesKind: OpponentCandidatesPort['kind'];
  readonly fightKind: FightRequestPort['kind'];
  readonly list: FightListState;
  readonly selected: OpponentCandidate | null;
  readonly submit: FightSubmitState;
  readonly lastFight: FightSuccess | null;
  refreshCandidates: () => Promise<void>;
  prepareEligibility: () => Promise<PrepareEligibilityResult | null>;
  selectOpponent: (candidate: OpponentCandidate | null) => void;
  startFight: () => Promise<FightSuccess | null>;
  clearSubmitError: () => void;
  resetIntent: () => void;
};

const FightSessionContext = createContext<FightSessionContextValue | null>(null);

export function FightSessionProvider(props: {
  children: React.ReactNode;
  candidates?: OpponentCandidatesPort;
  fights?: FightRequestPort;
}): React.ReactElement {
  const { session } = useGarageSession();
  const candidatesPort = useMemo(
    () => props.candidates ?? createOpponentCandidatesClient(),
    [props.candidates],
  );
  const fightPort = useMemo(() => props.fights ?? createFightRequestClient(), [props.fights]);

  const [list, setList] = useState<FightListState>({ status: 'idle' });
  const [selected, setSelected] = useState<OpponentCandidate | null>(null);
  const [submit, setSubmit] = useState<FightSubmitState>({ status: 'idle' });
  const [lastFight, setLastFight] = useState<FightSuccess | null>(null);
  const intentRef = useRef<FightIntent | null>(null);
  const inFlightRef = useRef<Promise<FightSuccess | null> | null>(null);

  const refreshCandidates = useCallback(async () => {
    if (!session) {
      setList({
        status: 'error',
        code: 'unauthenticated',
        message: 'Sign in to find opponents.',
      });
      return;
    }
    setList({ status: 'loading' });
    const result = await candidatesPort.listCandidates({
      accessToken: session.accessToken,
      accountId: session.userId,
    });
    if (!result.ok) {
      setList({
        status: 'error',
        code: result.code,
        message: result.message,
        ...(result.allowancesRemaining !== undefined
          ? { allowancesRemaining: result.allowancesRemaining }
          : {}),
      });
      return;
    }
    setList({
      status: 'ready',
      candidates: result.candidates,
      allowancesRemaining: result.allowancesRemaining,
      utcDay: result.utcDay,
    });
    setSelected((prev) => {
      if (!prev) return null;
      return result.candidates.find((c) => c.characterId === prev.characterId) ?? null;
    });
  }, [candidatesPort, session]);

  const selectOpponent = useCallback((candidate: OpponentCandidate | null) => {
    setSelected(candidate);
    intentRef.current = null;
    setSubmit({ status: 'idle' });
  }, []);

  const prepareEligibility = useCallback(async (): Promise<PrepareEligibilityResult | null> => {
    if (!session || !selected) return null;
    return candidatesPort.prepareEligibility({
      accessToken: session.accessToken,
      accountId: session.userId,
      opponentId: selected.characterId,
    });
  }, [session, selected, candidatesPort]);

  const clearSubmitError = useCallback(() => {
    setSubmit((s) => (s.status === 'error' ? { status: 'idle' } : s));
  }, []);

  const resetIntent = useCallback(() => {
    intentRef.current = null;
    setSubmit({ status: 'idle' });
  }, []);

  const startFight = useCallback(async (): Promise<FightSuccess | null> => {
    if (!session || !selected) return null;

    // Double-tap: join the in-flight request instead of starting a second one.
    if (inFlightRef.current) return inFlightRef.current;

    const intent = resolveFightIntent(intentRef.current, selected.characterId);
    intentRef.current = intent;

    const run = (async (): Promise<FightSuccess | null> => {
      setSubmit({ status: 'submitting' });
      const result = await fightPort.requestFight({
        accessToken: session.accessToken,
        opponentId: selected.characterId,
        idempotencyKey: intent.idempotencyKey,
      });
      if (!result.ok) {
        if (result.code === 'allowance_exhausted') {
          intentRef.current = null;
        }
        setSubmit({
          status: 'error',
          code: result.code,
          message: result.message,
          ...(result.allowancesRemaining !== undefined
            ? { allowancesRemaining: result.allowancesRemaining }
            : {}),
        });
        if (typeof result.allowancesRemaining === 'number' && list.status === 'ready') {
          setList({ ...list, allowancesRemaining: result.allowancesRemaining });
        }
        return null;
      }
      setLastFight(result.fight);
      setSubmit({ status: 'success', fight: result.fight });
      if (list.status === 'ready') {
        setList({ ...list, allowancesRemaining: result.fight.allowancesRemaining });
      }
      // Successful settle clears intent so a later rematch gets a new key.
      intentRef.current = null;
      return result.fight;
    })();

    inFlightRef.current = run;
    try {
      return await run;
    } finally {
      inFlightRef.current = null;
    }
  }, [session, selected, fightPort, list]);

  const value = useMemo<FightSessionContextValue>(
    () => ({
      candidatesKind: candidatesPort.kind,
      fightKind: fightPort.kind,
      list,
      selected,
      submit,
      lastFight,
      refreshCandidates,
      prepareEligibility,
      selectOpponent,
      startFight,
      clearSubmitError,
      resetIntent,
    }),
    [
      candidatesPort.kind,
      fightPort.kind,
      list,
      selected,
      submit,
      lastFight,
      refreshCandidates,
      prepareEligibility,
      selectOpponent,
      startFight,
      clearSubmitError,
      resetIntent,
    ],
  );

  return (
    <FightSessionContext.Provider value={value}>{props.children}</FightSessionContext.Provider>
  );
}

export function useFightSession(): FightSessionContextValue {
  const ctx = useContext(FightSessionContext);
  if (!ctx) throw new Error('useFightSession must be used within FightSessionProvider');
  return ctx;
}
