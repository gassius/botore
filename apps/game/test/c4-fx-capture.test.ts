import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileAnimationQueue } from '../src/replay-playback';
import { fxPeakFrameIndex } from '../src/arena/environmentPin';
import {
  FX_CAPTURE_FAMILIES,
  FX_CAPTURE_HOLD_MS,
  FX_CAPTURE_HOLD_SETTLE_MS,
  FX_CAPTURE_IDLE_BEFORE_PLAY_MS,
  completeFxCaptureHold,
  countFxEventsFromReplay,
  formatArenaReadyLog,
  formatFxCaptureLog,
  fxFamilyFromAnimationCommand,
  initialFxCaptureHoldState,
  noteFxCaptureCue,
} from '../src/replay/fxCaptureHold';
import { loadDevGoldenConfirmedResult } from '../src/replay/loadDevReplay';
import {
  emitPlaybackUi,
  pauseState,
  playbackUiAfterAdvance,
  restartState,
  resumeState,
  type PlaybackUiState,
} from '../src/replay/playbackControl';

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

  it('settles before HOLD so CI does not screencap pre-FX idle, and freezes peak frame', () => {
    // Strip is 3×90ms ≈ 270ms; without pause-freeze stills land after auto-hide.
    expect(FX_CAPTURE_HOLD_SETTLE_MS).toBeGreaterThanOrEqual(100);
    expect(FX_CAPTURE_HOLD_SETTLE_MS).toBeLessThan(FX_CAPTURE_HOLD_MS);
    expect(FX_CAPTURE_IDLE_BEFORE_PLAY_MS).toBeGreaterThan(FX_CAPTURE_HOLD_SETTLE_MS);
    expect(fxPeakFrameIndex(3)).toBe(1);
    expect(fxPeakFrameIndex(1)).toBe(0);
    expect(fxPeakFrameIndex(0)).toBe(0);
  });
});

describe('C4 same-tick FX pause (damage_pop → onFxCue → pause)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps playing false after hit cue pause until play() (fake rAF + timers)', () => {
    vi.useFakeTimers();
    type RafCb = (time: number) => void;
    const result = loadDevGoldenConfirmedResult(0);
    const queue = compileAnimationQueue(result.replay);
    const hitIndex = queue.findIndex((c) => c.kind === 'damage_pop');
    expect(hitIndex).toBeGreaterThanOrEqual(0);
    expect(fxFamilyFromAnimationCommand(queue[hitIndex]!)).toBe('hit');

    const ref = { current: restartState(queue.length) };
    const rafQueue: RafCb[] = [];
    const raf = (cb: RafCb): number => {
      rafQueue.push(cb);
      return rafQueue.length;
    };

    // Drive commands like CanonicalReplayPlayer.tick until the first hit.
    let frame = 0;
    const driveUntilHitOrPause = (): void => {
      while (ref.current.playing && ref.current.commandIndex <= hitIndex) {
        const nextIndex = ref.current.commandIndex + 1;
        const cmd = queue[ref.current.commandIndex];
        const advanced = emitPlaybackUi(ref, playbackUiAfterAdvance(ref.current, nextIndex));
        expect(advanced.shouldContinue).toBe(true);
        if (cmd && fxFamilyFromAnimationCommand(cmd) === 'hit') {
          // ReplaySlot.onFxCue → pause (same tick, after advance emit).
          const paused = emitPlaybackUi(ref, pauseState(ref.current));
          expect(paused.state.playing).toBe(false);
          expect(paused.shouldContinue).toBe(false);
          // Do not schedule another frame while held.
          return;
        }
        if (!ref.current.playing) return;
        raf((_now: number) => {
          frame += 1;
        });
        // Flush one scheduled frame (presentation clock), then advance again.
        const cb = rafQueue.shift();
        cb?.(frame * 16);
      }
    };

    driveUntilHitOrPause();
    expect(ref.current.playing).toBe(false);
    expect(ref.current.commandIndex).toBe(hitIndex + 1);

    // Stale-ref overwrite must not resurrect playing:true after a synced pause.
    const afterHoldCheck = emitPlaybackUi(ref, ref.current);
    expect(afterHoldCheck.shouldContinue).toBe(false);

    // Capture hold timer resumes playback.
    let resumed: PlaybackUiState | undefined;
    setTimeout(() => {
      resumed = emitPlaybackUi(ref, resumeState(ref.current)).state;
    }, FX_CAPTURE_HOLD_MS);
    expect(ref.current.playing).toBe(false);
    vi.advanceTimersByTime(FX_CAPTURE_HOLD_MS);
    expect(resumed?.playing).toBe(true);
    expect(ref.current.playing).toBe(true);
  });
});
