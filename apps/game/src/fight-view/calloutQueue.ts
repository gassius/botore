/**
 * Fight View call-out queue — D10 / E2.
 * Minimum dwell so headline + detail stay readable; identical plates collapse
 * with ×n; pending capped with majors (KO / heavy) preferred over minors.
 * Pure state machine; wall clock is injected via `nowMs` (apps/game only).
 */
import type { FightViewCallout } from './types';

/**
 * Minimum time a callout plate stays on screen before the next queued event
 * may replace it (D10: 1.2 s).
 */
export const FIGHT_VIEW_CALLOUT_MIN_DWELL_MS = 1200;

/** Max pending plates behind the current one (D10). */
export const FIGHT_VIEW_CALLOUT_QUEUE_MAX = 3;

export type QueuedCallout = {
  readonly callout: FightViewCallout;
  readonly count: number;
};

export type CalloutQueueState = {
  readonly current: QueuedCallout | null;
  readonly shownAtMs: number | null;
  readonly pending: readonly QueuedCallout[];
};

export function initialCalloutQueueState(): CalloutQueueState {
  return { current: null, shownAtMs: null, pending: [] };
}

export function resetCalloutQueue(): CalloutQueueState {
  return initialCalloutQueueState();
}

export function sameCallout(a: FightViewCallout, b: FightViewCallout): boolean {
  return a.headline === b.headline && a.detail === b.detail;
}

/** KO / heavy plates are major — never drop these when the pending queue overflows. */
export function isMajorCallout(callout: FightViewCallout): boolean {
  const h = callout.headline.toLowerCase();
  return h.includes('ko') || h.includes('heavy');
}

/** Terminal KO plate — must preempt dwell and clear pending so it shows before Result overlay. */
export function isTerminalKoCallout(callout: FightViewCallout): boolean {
  return callout.headline.toLowerCase().includes('ko');
}

/** Headline without trailing bangs — used with a separate oxide `×n` (D10 mockup). */
export function formatCalloutHeadlineBase(callout: FightViewCallout): string {
  return callout.headline.replace(/!+\s*$/u, '').trim();
}

/** Player-facing headline; collapses repeats as `HIT ×3` (uppercase via style). */
export function formatCalloutHeadline(callout: FightViewCallout, count: number): string {
  if (count <= 1) return callout.headline;
  return `${formatCalloutHeadlineBase(callout)} ×${count}`;
}

function dwellElapsed(
  state: CalloutQueueState,
  nowMs: number,
  minDwellMs: number = FIGHT_VIEW_CALLOUT_MIN_DWELL_MS,
): boolean {
  if (state.current === null || state.shownAtMs === null) return true;
  return nowMs - state.shownAtMs >= minDwellMs;
}

/**
 * Trim pending to QUEUE_MAX by dropping the oldest minor first.
 * If every pending plate is major, drop the oldest entry.
 */
export function trimCalloutPending(
  pending: readonly QueuedCallout[],
  max: number = FIGHT_VIEW_CALLOUT_QUEUE_MAX,
): readonly QueuedCallout[] {
  const next = [...pending];
  while (next.length > max) {
    const minorIdx = next.findIndex((entry) => !isMajorCallout(entry.callout));
    if (minorIdx >= 0) {
      next.splice(minorIdx, 1);
    } else {
      next.shift();
    }
  }
  return next;
}

/**
 * Offer a mapped combat call-out to the band.
 * Null is ignored (does not clear the plate — keeps KO through quiet commands).
 * Identical current / last-pending plates collapse with an incremented count
 * (no re-flash / dwell reset on the current plate).
 * Terminal KO preempts: drops pending and becomes `current` immediately so the
 * plate is visible before the ~1.8 s Result overlay handoff.
 */
export function enqueueCallout(
  state: CalloutQueueState,
  callout: FightViewCallout | null,
  nowMs: number,
  minDwellMs: number = FIGHT_VIEW_CALLOUT_MIN_DWELL_MS,
): CalloutQueueState {
  if (!callout) return state;

  if (isTerminalKoCallout(callout)) {
    if (state.current && sameCallout(state.current.callout, callout)) {
      return {
        current: { callout: state.current.callout, count: state.current.count + 1 },
        shownAtMs: state.shownAtMs,
        pending: [],
      };
    }
    return {
      current: { callout, count: 1 },
      shownAtMs: nowMs,
      pending: [],
    };
  }

  if (state.current === null) {
    return {
      current: { callout, count: 1 },
      shownAtMs: nowMs,
      pending: state.pending,
    };
  }

  if (sameCallout(state.current.callout, callout)) {
    return {
      current: { callout: state.current.callout, count: state.current.count + 1 },
      shownAtMs: state.shownAtMs,
      pending: state.pending,
    };
  }

  if (dwellElapsed(state, nowMs, minDwellMs) && state.pending.length === 0) {
    return {
      current: { callout, count: 1 },
      shownAtMs: nowMs,
      pending: [],
    };
  }

  const lastPending = state.pending[state.pending.length - 1];
  if (lastPending && sameCallout(lastPending.callout, callout)) {
    const pending = [...state.pending];
    pending[pending.length - 1] = {
      callout: lastPending.callout,
      count: lastPending.count + 1,
    };
    return {
      current: state.current,
      shownAtMs: state.shownAtMs,
      pending,
    };
  }

  return {
    current: state.current,
    shownAtMs: state.shownAtMs,
    pending: trimCalloutPending([...state.pending, { callout, count: 1 }]),
  };
}

/**
 * Promote the next queued call-out once the current plate has dwelled long enough.
 * Never auto-clears to empty — quiet/empty is only the initial or reset state
 * (and rewatch, which does not feed the queue).
 */
export function advanceCalloutQueue(
  state: CalloutQueueState,
  nowMs: number,
  minDwellMs: number = FIGHT_VIEW_CALLOUT_MIN_DWELL_MS,
): CalloutQueueState {
  if (state.pending.length === 0) return state;
  if (!dwellElapsed(state, nowMs, minDwellMs)) return state;

  const [next, ...rest] = state.pending;
  if (!next) return state;
  return { current: next, shownAtMs: nowMs, pending: rest };
}

/**
 * Delay until the next advance is due, or null when idle / nothing pending.
 */
export function msUntilCalloutAdvance(
  state: CalloutQueueState,
  nowMs: number,
  minDwellMs: number = FIGHT_VIEW_CALLOUT_MIN_DWELL_MS,
): number | null {
  if (state.pending.length === 0) return null;
  if (state.current === null || state.shownAtMs === null) return 0;
  const remaining = minDwellMs - (nowMs - state.shownAtMs);
  return remaining <= 0 ? 0 : remaining;
}
