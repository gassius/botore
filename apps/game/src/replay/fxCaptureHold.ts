/**
 * C4 — design-capture holds for event-driven Repair Yard FX.
 * Pause briefly on the first hit / dodge / defeat cue so Android stills can
 * show each family. FX still spawn only from recorded animation commands.
 */
import type { ArenaFxFamily } from '../arena/environmentPin';
import type { AnimationCommand } from '../replay-playback';

export type FxCaptureFamily = ArenaFxFamily;

export type FxCaptureHoldState = {
  readonly held: ReadonlySet<FxCaptureFamily>;
  readonly pendingHold: FxCaptureFamily | null;
};

/**
 * PROVISIONAL hold window for still capture — not final FX timing.
 * Long enough for CI to notice HOLD in logcat and screencap while paused.
 */
export const FX_CAPTURE_HOLD_MS = 8000;

export const FX_CAPTURE_FAMILIES: readonly FxCaptureFamily[] = ['hit', 'dodge', 'defeat'];

export function initialFxCaptureHoldState(): FxCaptureHoldState {
  return { held: new Set<FxCaptureFamily>(), pendingHold: null };
}

/**
 * First unseen family → shouldHold. Concurrent holds are ignored until resume.
 * Already-held families never re-hold (one still per family per playback).
 */
export function noteFxCaptureCue(
  state: FxCaptureHoldState,
  family: FxCaptureFamily,
): { readonly next: FxCaptureHoldState; readonly shouldHold: boolean } {
  if (state.held.has(family) || state.pendingHold !== null) {
    return { next: state, shouldHold: false };
  }
  return {
    next: { held: state.held, pendingHold: family },
    shouldHold: true,
  };
}

export function completeFxCaptureHold(state: FxCaptureHoldState): FxCaptureHoldState {
  if (state.pendingHold === null) return state;
  const held = new Set(state.held);
  held.add(state.pendingHold);
  return { held, pendingHold: null };
}

export function fxFamilyFromAnimationCommand(cmd: AnimationCommand): FxCaptureFamily | null {
  switch (cmd.kind) {
    case 'damage_pop':
      return 'hit';
    case 'dodge_anim':
      return 'dodge';
    case 'defeat_anim':
      return 'defeat';
    default:
      return null;
  }
}

/** Count FX-producing event kinds on a sealed replay event list. */
export function countFxEvents(
  events: readonly { readonly type: string }[],
): Record<FxCaptureFamily, number> {
  const counts: Record<FxCaptureFamily, number> = { hit: 0, dodge: 0, defeat: 0 };
  for (const ev of events) {
    if (ev.type === 'damage_applied') counts.hit += 1;
    else if (ev.type === 'dodged') counts.dodge += 1;
    else if (ev.type === 'character_defeated') counts.defeat += 1;
  }
  return counts;
}

/** Extract typed event rows from a FightSuccess.replay blob (fail soft). */
export function eventsFromFightReplay(replay: unknown): readonly { readonly type: string }[] {
  if (!replay || typeof replay !== 'object') return [];
  const events = (replay as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];
  const out: { type: string }[] = [];
  for (const ev of events) {
    if (
      ev != null &&
      typeof ev === 'object' &&
      typeof (ev as { type?: unknown }).type === 'string'
    ) {
      out.push({ type: (ev as { type: string }).type });
    }
  }
  return out;
}

export function countFxEventsFromReplay(replay: unknown): Record<FxCaptureFamily, number> {
  return countFxEvents(eventsFromFightReplay(replay));
}

export function formatFxCaptureLog(
  family: FxCaptureFamily,
  phase: 'fire' | 'hold' | 'resume',
): string {
  return `BOTORE_CAPTURE_FX_${phase.toUpperCase()}:family=${family}`;
}

export function formatArenaReadyLog(): string {
  return 'BOTORE_CAPTURE_ARENA_READY:environment-v001';
}
