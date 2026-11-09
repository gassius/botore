import { isServerPlaybackReady } from '../replay/serverPlayback';
import type { OpponentCandidate } from './candidates/types';
import { resolveFightIntent, type FightIntent } from './request/idempotency';
import type { FightRequestPort } from './request/FightRequestPort';
import type { FightRequestResult, FightSuccess } from './request/types';

export type InFlightFight = {
  readonly opponentId: string;
  readonly idempotencyKey: string;
  readonly promise: Promise<FightSuccess | null>;
};

/** Same-opponent reselection must keep an unresolved intent (lost-response recovery). */
export function shouldPreserveUnresolvedIntent(
  current: FightIntent | null,
  nextOpponentId: string | null,
): boolean {
  return current !== null && nextOpponentId !== null && current.opponentId === nextOpponentId;
}

/** Only join an in-flight request that belongs to the currently selected opponent. */
export function canJoinInFlight(
  inFlight: InFlightFight | null,
  opponentId: string | null,
): boolean {
  return inFlight !== null && opponentId !== null && inFlight.opponentId === opponentId;
}

/**
 * Continue is allowed for a new fight when allowance remains, OR to recover an
 * unresolved same-opponent intent even if refreshed unused allowance is zero
 * (final-slot recovery via F3 lookup-before-eligibility).
 */
export function canContinueToConfirm(input: {
  selected: OpponentCandidate | null;
  listReady: boolean;
  emptyCandidates: boolean;
  allowancesRemaining: number;
  pendingIntent: FightIntent | null;
}): boolean {
  if (!input.selected || !input.listReady || input.emptyCandidates) return false;
  const recoverable =
    input.pendingIntent !== null && input.pendingIntent.opponentId === input.selected.characterId;
  return input.allowancesRemaining > 0 || recoverable;
}

/**
 * Start/Retry disable rules for ConfirmFight.
 * Zero eligibility / allowance_exhausted block *new* fights only.
 * An unresolved matching same-opponent intent must stay actionable so Edge
 * lookup-before-eligibility can recover a committed final-slot result.
 */
export function isStartFightDisabled(input: {
  submitting: boolean;
  sessionPresent: boolean;
  allowances: number | null;
  submitCode: string | null;
  /** Retained Idempotency-Key for the selected opponent (lost-response recovery). */
  recoverableSameOpponentIntent?: boolean;
}): boolean {
  if (!input.sessionPresent || input.submitting) return true;
  if (input.recoverableSameOpponentIntent === true) {
    return false;
  }
  if (input.submitCode === 'allowance_exhausted') return true;
  if (input.allowances !== null && input.allowances < 1) return true;
  return false;
}

/** ConfirmFight footer action state — shared by UI + regression harness. */
export function computeConfirmFightControls(input: {
  canProgress: boolean;
  hasConfirmedLoadout: boolean;
  submitting: boolean;
  sessionPresent: boolean;
  allowances: number | null;
  submitStatus: 'idle' | 'submitting' | 'success' | 'error';
  submitCode: string | null;
  pendingIntent: FightIntent | null;
  selectedOpponentId: string | null;
}): {
  recoverable: boolean;
  startDisabled: boolean;
  showRetry: boolean;
  retryDisabled: boolean;
} {
  const recoverable =
    input.pendingIntent !== null &&
    input.selectedOpponentId !== null &&
    input.pendingIntent.opponentId === input.selectedOpponentId;

  const startDisabled =
    !input.canProgress ||
    !input.hasConfirmedLoadout ||
    isStartFightDisabled({
      submitting: input.submitting,
      sessionPresent: input.sessionPresent,
      allowances: input.allowances,
      submitCode: input.submitCode,
      recoverableSameOpponentIntent: recoverable,
    });

  const networkOrOtherError =
    input.submitStatus === 'error' &&
    input.submitCode !== null &&
    input.submitCode !== 'allowance_exhausted';

  // Remounted Confirm after lost response is often idle — still expose Retry for recovery.
  const showRetry = recoverable || networkOrOtherError;
  const retryDisabled = startDisabled || input.submitting;

  return { recoverable, startDisabled, showRetry, retryDisabled };
}

/**
 * Late completions must not navigate away from a screen that no longer owns
 * the active intent/opponent (Back → pick B while A's HTTP is outstanding).
 * Also refuse DEV scaffold / unsealed payloads — first-run Replay needs a
 * server-precomputed sealed battle with garage sealed builds (same robot).
 */
export function shouldAcceptFightNavigation(input: {
  fight: FightSuccess | null;
  expectedOpponentId: string | null;
  navigationGeneration: number;
  activeNavigationGeneration: number;
}): boolean {
  if (!input.fight || !input.expectedOpponentId) return false;
  if (input.fight.opponentId !== input.expectedOpponentId) return false;
  if (input.navigationGeneration !== input.activeNavigationGeneration) return false;
  if (!isServerPlaybackReady(input.fight)) return false;
  return true;
}

export type StartFightDeps = {
  accessToken: string;
  selected: OpponentCandidate;
  intent: FightIntent | null;
  inFlight: InFlightFight | null;
  fightPort: FightRequestPort;
};

export type StartFightOutcome = {
  readonly promise: Promise<FightSuccess | null>;
  readonly intent: FightIntent;
  readonly joinedExisting: boolean;
};

/**
 * Begin or join a fight request bound to one opponent + idempotency key.
 * Never joins a foreign opponent's in-flight Promise.
 */
export function beginOrJoinFightRequest(deps: StartFightDeps): StartFightOutcome | null {
  if (canJoinInFlight(deps.inFlight, deps.selected.characterId) && deps.inFlight) {
    return {
      promise: deps.inFlight.promise,
      intent: {
        opponentId: deps.inFlight.opponentId,
        idempotencyKey: deps.inFlight.idempotencyKey,
      },
      joinedExisting: true,
    };
  }
  if (deps.inFlight && deps.inFlight.opponentId !== deps.selected.characterId) {
    // Foreign in-flight must not be joined; caller should block opponent switch.
    return null;
  }

  const intent = resolveFightIntent(deps.intent, deps.selected.characterId);
  const promise = deps.fightPort
    .requestFight({
      accessToken: deps.accessToken,
      opponentId: deps.selected.characterId,
      idempotencyKey: intent.idempotencyKey,
    })
    .then((result: FightRequestResult) => {
      if (!result.ok) return null;
      return result.fight;
    });

  // Note: the provider wraps this with richer error handling; tests for join
  // semantics use the bound InFlightFight around the provider path.
  return { promise, intent, joinedExisting: false };
}

/** After a successful client apply, intent is reconciled and may be cleared. */
export function intentAfterFightResult(input: {
  prior: FightIntent | null;
  resultOk: boolean;
  code: string | null;
}): FightIntent | null {
  if (input.resultOk) return null; // reconciled
  if (input.code === 'allowance_exhausted') {
    // Exhaustion on a *new* attempt — drop intent so we don't loop forever.
    // Recovery of an already-committed key returns ok/repeated, not exhausted.
    return null;
  }
  // Network / other failures keep prior intent for retry with the same key.
  return input.prior;
}
