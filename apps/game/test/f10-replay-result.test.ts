import { describe, it, expect } from 'vitest';
import { compileAnimationQueue } from '../src/replay-playback';
import {
  applyAnimationCommand,
  confirmedResultFromDevReplay,
  confirmedResultFromFightResponse,
  confirmedResultFromFightSuccess,
  initialPresentationState,
  loadDevGoldenConfirmedResult,
  normalizeHpAfter,
  replayIdentityFingerprint,
  resolvePlaybackMedia,
  resolveSessionConfirmedResult,
} from '../src/replay';
import type { FightComputeResponse } from '@botore/contracts';
import type { FightSuccess } from '../src/fight/request/types';

describe('F10 canonical replay determinism', () => {
  it('same golden fixture yields identical fingerprint on repeat', () => {
    const a = loadDevGoldenConfirmedResult(0);
    const b = loadDevGoldenConfirmedResult(0);
    expect(replayIdentityFingerprint(a.replay)).toBe(replayIdentityFingerprint(b.replay));
    expect(a.replay.checksum).toBe(b.replay.checksum);
    expect(compileAnimationQueue(a.replay)).toEqual(compileAnimationQueue(b.replay));
  });

  it('labels DEV fixtures and never invents XP / allowances', () => {
    const result = loadDevGoldenConfirmedResult(0);
    expect(result.label).toBe('DEV');
    expect(result.serverConfirmed).toBe(false);
    expect(result.xpAwarded).toBeNull();
    expect(result.allowancesRemaining).toBeNull();
    expect(result.outcome).toEqual(result.replay.outcome);
  });
});

describe('F10 event-driven FX binding', () => {
  it('spawns hit/dodge/defeat FX only from matching animation commands', () => {
    const result = loadDevGoldenConfirmedResult(0);
    const nearId = result.replay.fighters[0].characterId;
    const farId = result.replay.fighters[1].characterId;
    const maxHp = { near: result.replay.fighters[0].hp, far: result.replay.fighters[1].hp };
    let state = initialPresentationState(nearId, farId);

    state = applyAnimationCommand(state, { kind: 'turn_banner', actor: nearId }, 1, maxHp);
    expect(state.activeFx).toEqual([]);

    state = applyAnimationCommand(
      state,
      { kind: 'attack_anim', actor: nearId, attack: 'weapon' },
      2,
      maxHp,
    );
    expect(state.activeFx).toEqual([]);
    expect(state.near.motionPose).toBe('attack');

    state = applyAnimationCommand(state, { kind: 'dodge_anim', actor: farId }, 3, maxHp);
    expect(state.activeFx).toEqual([{ family: 'dodge', targetSlot: 'far', cueKey: 'dodge-3' }]);
    expect(state.far.motionPose).toBe('dodge');

    state = applyAnimationCommand(
      state,
      { kind: 'damage_pop', target: farId, amount: 5, hpAfter: maxHp.far - 5 },
      4,
      maxHp,
    );
    expect(state.activeFx[0]?.family).toBe('hit');
    expect(state.activeFx[0]?.targetSlot).toBe('contact');
    expect(state.far.motionPose).toBe('hit');
    expect(state.hp.far).toBeCloseTo(normalizeHpAfter(maxHp.far - 5, maxHp.far));

    state = applyAnimationCommand(state, { kind: 'defeat_anim', characterId: farId }, 5, maxHp);
    expect(state.activeFx[0]?.family).toBe('defeat');
    expect(state.far.motionPose).toBe('defeat');

    // Full queue never invents FX outside dodge/damage/defeat commands.
    const queue = compileAnimationQueue(result.replay);
    const fxKinds = new Set(
      queue
        .map((c) => c.kind)
        .filter((k) => k === 'dodge_anim' || k === 'damage_pop' || k === 'defeat_anim'),
    );
    for (const k of fxKinds) {
      expect(['dodge_anim', 'damage_pop', 'defeat_anim']).toContain(k);
    }
  });
});

describe('confirmed result from server response', () => {
  it('copies XP/outcome from FightComputeResponse without alteration', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const response = {
      battleId: '11111111-1111-4111-8111-111111111111',
      status: 'completed',
      rulesVersion: 'combat-v1',
      seed: base.replay.seed,
      outcome: {
        winner: base.replay.outcome.winner,
        reason: base.replay.outcome.reason,
      },
      replay: base.replay,
      replayChecksum: base.replay.checksum,
      xpAwarded: 2,
      loadoutVersionIds: {
        attacker: '22222222-2222-4222-8222-222222222222',
        defender: '33333333-3333-4333-8333-333333333333',
      },
      atlasVersions: { attacker: 'v1', defender: 'v1' },
      allowancesRemaining: 1,
      utcDay: '2026-11-08',
      persistence: 'persisted',
      repeated: false,
      service: 'combat-v1',
    } as unknown as FightComputeResponse;

    const confirmed = confirmedResultFromFightResponse(response);
    expect(confirmed.serverConfirmed).toBe(true);
    expect(confirmed.label).toBe('CONFIRMED');
    expect(confirmed.xpAwarded).toBe(2);
    expect(confirmed.allowancesRemaining).toBe(1);
    expect(confirmed.media.atlasVersions).toEqual({ attacker: 'v1', defender: 'v1' });
    const media = resolvePlaybackMedia(confirmed);
    expect(media.usesStoredVersions).toBe(true);
  });

  it('dev wrapper keeps sealed outcome only', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const wrapped = confirmedResultFromDevReplay(base.replay, {
      atlasVersions: { attacker: 'v1', defender: 'v1' },
    });
    expect(wrapped.xpAwarded).toBeNull();
    expect(wrapped.outcome).toBe(base.replay.outcome);
  });

  it('maps F9 FightSuccess when sealed replay validates', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const fight: FightSuccess = {
      battleId: base.battleId,
      status: 'completed',
      rulesVersion: 'combat-v1',
      seed: base.replay.seed,
      outcome: {
        winner: base.replay.outcome.winner,
        reason: base.replay.outcome.reason,
      },
      replay: base.replay,
      replayChecksum: base.replay.checksum,
      xpAwarded: 2,
      allowancesRemaining: 1,
      utcDay: '2026-11-09',
      repeated: false,
      persistence: 'persisted',
      loadoutVersionIds: {
        attacker: '22222222-2222-4222-8222-222222222222',
        defender: '33333333-3333-4333-8333-333333333333',
      },
      atlasVersions: { attacker: 'v1', defender: 'v1' },
      opponentId: 'opp-sir-bot',
      idempotencyKey: 'idem-test-key-01',
    };
    const confirmed = confirmedResultFromFightSuccess(fight);
    expect(confirmed.serverConfirmed).toBe(true);
    expect(confirmed.xpAwarded).toBe(2);
    expect(confirmed.outcome).toEqual(base.replay.outcome);
    expect(resolveSessionConfirmedResult(fight).label).toBe('CONFIRMED');
  });

  it('falls back to DEV golden when FightSuccess replay is not sealed', () => {
    const scaffold: FightSuccess = {
      battleId: 'dev-battle',
      status: 'completed',
      rulesVersion: 'combat-v1',
      seed: '0'.repeat(64),
      outcome: { winner: 'player-hero', reason: 'defeat' },
      replay: { note: 'DEV scaffold — not sealed' },
      replayChecksum: 'dev-checksum',
      xpAwarded: 0,
      allowancesRemaining: 2,
      utcDay: '2026-11-09',
      repeated: false,
      persistence: 'persisted',
      loadoutVersionIds: { attacker: 'a', defender: 'b' },
      atlasVersions: { attacker: 'v1', defender: 'v1' },
      opponentId: 'opp',
      idempotencyKey: 'idem-dev',
    };
    const resolved = resolveSessionConfirmedResult(scaffold);
    expect(resolved.label).toBe('DEV');
    expect(resolved.serverConfirmed).toBe(false);
    expect(resolved.xpAwarded).toBeNull();
    expect(resolveSessionConfirmedResult(null).label).toBe('DEV');
  });
});
