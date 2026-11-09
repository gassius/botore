import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useGarageSession } from '../garage/LoadoutSessionContext';
import { createOpponentCandidatesClient } from './candidates/createOpponentCandidatesClient';
import type { OpponentCandidatesPort } from './candidates/OpponentCandidatesPort';
import type { OpponentCandidate, PrepareEligibilityResult } from './candidates/types';
import {
  canJoinInFlight,
  intentAfterFightResult,
  shouldPreserveUnresolvedIntent,
  type InFlightFight,
} from './fightSessionLifecycle';
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
  /** Unresolved Start-fight intent (survives same-opponent reselection / lost response). */
  readonly pendingIntent: FightIntent | null;
  /** True while a combat-v1 request for the selected (or in-flight) opponent is outstanding. */
  readonly fightInFlight: boolean;
  refreshCandidates: () => Promise<void>;
  prepareEligibility: () => Promise<PrepareEligibilityResult | null>;
  selectOpponent: (
    candidate: OpponentCandidate | null,
  ) => { ok: true } | { ok: false; code: string };
  startFight: () => Promise<FightSuccess | null>;
  clearSubmitError: () => void;
  resetIntent: () => void;
  /** Bump when leaving Confirm so late A completions do not navigate. */
  bumpNavigationGeneration: () => void;
  readonly navigationGeneration: number;
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
  const [pendingIntent, setPendingIntent] = useState<FightIntent | null>(null);
  const [navigationGeneration, setNavigationGeneration] = useState(0);
  const [fightInFlight, setFightInFlight] = useState(false);

  const intentRef = useRef<FightIntent | null>(null);
  const inFlightRef = useRef<InFlightFight | null>(null);
  const selectedRef = useRef<OpponentCandidate | null>(null);
  const listRef = useRef<FightListState>(list);
  selectedRef.current = selected;
  listRef.current = list;

  const syncIntent = useCallback((next: FightIntent | null) => {
    intentRef.current = next;
    setPendingIntent(next);
  }, []);

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

  const selectOpponent = useCallback(
    (candidate: OpponentCandidate | null): { ok: true } | { ok: false; code: string } => {
      const inFlight = inFlightRef.current;
      if (inFlight && candidate?.characterId !== inFlight.opponentId && candidate !== null) {
        // Block switching to B while A's request is outstanding.
        return { ok: false, code: 'fight_in_flight' };
      }

      if (shouldPreserveUnresolvedIntent(intentRef.current, candidate?.characterId ?? null)) {
        setSelected(candidate);
        // Keep unresolved intent + idle/error submit for recovery; do not wipe key.
        if (submit.status === 'success') {
          setSubmit({ status: 'idle' });
        }
        return { ok: true };
      }

      setSelected(candidate);
      syncIntent(null);
      setSubmit({ status: 'idle' });
      return { ok: true };
    },
    [submit.status, syncIntent],
  );

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
    syncIntent(null);
    setSubmit({ status: 'idle' });
  }, [syncIntent]);

  const bumpNavigationGeneration = useCallback(() => {
    setNavigationGeneration((g) => g + 1);
  }, []);

  const startFight = useCallback(async (): Promise<FightSuccess | null> => {
    if (!session || !selected) return null;

    if (canJoinInFlight(inFlightRef.current, selected.characterId) && inFlightRef.current) {
      return inFlightRef.current.promise;
    }
    if (inFlightRef.current && inFlightRef.current.opponentId !== selected.characterId) {
      return null;
    }

    const intent = resolveFightIntent(intentRef.current, selected.characterId);
    syncIntent(intent);

    const opponentIdForRequest = selected.characterId;
    const keyForRequest = intent.idempotencyKey;

    const run = (async (): Promise<FightSuccess | null> => {
      setSubmit({ status: 'submitting' });
      setFightInFlight(true);
      const result = await fightPort.requestFight({
        accessToken: session.accessToken,
        opponentId: opponentIdForRequest,
        idempotencyKey: keyForRequest,
      });

      // Ignore applying foreign late results if selection changed somehow.
      const stillSameOpponent = selectedRef.current?.characterId === opponentIdForRequest;

      if (!result.ok) {
        const nextIntent = intentAfterFightResult({
          prior: { opponentId: opponentIdForRequest, idempotencyKey: keyForRequest },
          resultOk: false,
          code: result.code,
        });
        syncIntent(nextIntent);
        if (stillSameOpponent) {
          setSubmit({
            status: 'error',
            code: result.code,
            message: result.message,
            ...(result.allowancesRemaining !== undefined
              ? { allowancesRemaining: result.allowancesRemaining }
              : result.code === 'allowance_exhausted'
                ? { allowancesRemaining: 0 }
                : {}),
          });
          const currentList = listRef.current;
          if (result.code === 'allowance_exhausted' && currentList.status === 'ready') {
            setList({ ...currentList, allowancesRemaining: 0 });
          } else if (
            typeof result.allowancesRemaining === 'number' &&
            currentList.status === 'ready'
          ) {
            setList({ ...currentList, allowancesRemaining: result.allowancesRemaining });
          }
        }
        return null;
      }

      // Reconcile only when this result still matches the request opponent.
      if (!stillSameOpponent) {
        // Keep intent for the original opponent so recovery remains possible if user returns.
        syncIntent({ opponentId: opponentIdForRequest, idempotencyKey: keyForRequest });
        return result.fight;
      }

      setLastFight(result.fight);
      setSubmit({ status: 'success', fight: result.fight });
      const currentList = listRef.current;
      if (currentList.status === 'ready') {
        setList({ ...currentList, allowancesRemaining: result.fight.allowancesRemaining });
      }
      syncIntent(intentAfterFightResult({ prior: intent, resultOk: true, code: null }));
      return result.fight;
    })();

    inFlightRef.current = {
      opponentId: opponentIdForRequest,
      idempotencyKey: keyForRequest,
      promise: run,
    };
    try {
      return await run;
    } finally {
      if (inFlightRef.current?.idempotencyKey === keyForRequest) {
        inFlightRef.current = null;
      }
      setFightInFlight(false);
    }
  }, [session, selected, fightPort, syncIntent]);

  const value = useMemo<FightSessionContextValue>(
    () => ({
      candidatesKind: candidatesPort.kind,
      fightKind: fightPort.kind,
      list,
      selected,
      submit,
      lastFight,
      pendingIntent,
      fightInFlight,
      refreshCandidates,
      prepareEligibility,
      selectOpponent,
      startFight,
      clearSubmitError,
      resetIntent,
      bumpNavigationGeneration,
      navigationGeneration,
    }),
    [
      candidatesPort.kind,
      fightPort.kind,
      list,
      selected,
      submit,
      lastFight,
      pendingIntent,
      fightInFlight,
      refreshCandidates,
      prepareEligibility,
      selectOpponent,
      startFight,
      clearSubmitError,
      resetIntent,
      bumpNavigationGeneration,
      navigationGeneration,
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
