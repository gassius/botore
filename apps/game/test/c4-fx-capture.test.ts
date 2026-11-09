import { describe, expect, it } from 'vitest';
import { compileAnimationQueue } from '../src/replay-playback';
import {
  FX_CAPTURE_FAMILIES,
  FX_CAPTURE_HOLD_MS,
  completeFxCaptureHold,
  countFxEventsFromReplay,
  formatArenaReadyLog,
  formatFxCaptureLog,
  fxFamilyFromAnimationCommand,
  initialFxCaptureHoldState,
  noteFxCaptureCue,
} from '../src/replay/fxCaptureHold';
import { loadDevGoldenConfirmedResult } from '../src/replay/loadDevReplay';

describe('C4 event-driven FX capture holds', () => {
  it('holds once per FX family and ignores concurrent/repeat cues', () => {
    let state = initialFxCaptureHoldState();

    let step = noteFxCaptureCue(state, 'hit');
    expect(step.shouldHold).toBe(true);
    state = step.next;
    expect(state.pendingHold).toBe('hit');

    // Concurrent cue ignored until resume completes.
    step = noteFxCaptureCue(state, 'dodge');
    expect(step.shouldHold).toBe(false);

    state = completeFxCaptureHold(state);
    expect(state.held.has('hit')).toBe(true);
    expect(state.pendingHold).toBeNull();

    // Already held — never re-hold.
    step = noteFxCaptureCue(state, 'hit');
    expect(step.shouldHold).toBe(false);

    step = noteFxCaptureCue(state, 'dodge');
    expect(step.shouldHold).toBe(true);
    state = completeFxCaptureHold(step.next);

    step = noteFxCaptureCue(state, 'defeat');
    expect(step.shouldHold).toBe(true);
    state = completeFxCaptureHold(step.next);

    for (const family of FX_CAPTURE_FAMILIES) {
      expect(state.held.has(family)).toBe(true);
    }
    expect(FX_CAPTURE_HOLD_MS).toBeGreaterThanOrEqual(8000);
  });

  it('maps animation commands to FX families only for recorded hit/dodge/defeat', () => {
    expect(fxFamilyFromAnimationCommand({ kind: 'attack_anim', actor: 'a', attack: 'basic' })).toBe(
      null,
    );
    expect(fxFamilyFromAnimationCommand({ kind: 'turn_banner', actor: 'a' })).toBeNull();
    expect(
      fxFamilyFromAnimationCommand({
        kind: 'damage_pop',
        target: 'b',
        amount: 3,
        hpAfter: 7,
      }),
    ).toBe('hit');
    expect(fxFamilyFromAnimationCommand({ kind: 'dodge_anim', actor: 'b' })).toBe('dodge');
    expect(fxFamilyFromAnimationCommand({ kind: 'defeat_anim', characterId: 'b' })).toBe('defeat');
  });

  it('counts FX events from golden sealed replay (hit + dodge + defeat present)', () => {
    const result = loadDevGoldenConfirmedResult(0);
    const counts = countFxEventsFromReplay(result.replay);
    expect(counts.hit).toBeGreaterThan(0);
    expect(counts.dodge).toBeGreaterThan(0);
    expect(counts.defeat).toBe(1);

    const queue = compileAnimationQueue(result.replay);
    const families = new Set(
      queue.map(fxFamilyFromAnimationCommand).filter((f): f is NonNullable<typeof f> => f != null),
    );
    expect(families.has('hit')).toBe(true);
    expect(families.has('dodge')).toBe(true);
    expect(families.has('defeat')).toBe(true);
  });

  it('formats capture log markers for CI greps', () => {
    expect(formatArenaReadyLog()).toBe('BOTORE_CAPTURE_ARENA_READY:environment-v001');
    expect(formatFxCaptureLog('hit', 'hold')).toBe('BOTORE_CAPTURE_FX_HOLD:family=hit');
    expect(formatFxCaptureLog('dodge', 'fire')).toBe('BOTORE_CAPTURE_FX_FIRE:family=dodge');
    expect(formatFxCaptureLog('defeat', 'resume')).toBe('BOTORE_CAPTURE_FX_RESUME:family=defeat');
  });
});
