import { describe, it, expect } from 'vitest';
import { compileAnimationQueue } from '../src/replay-playback';
import {
  ACTIVE_ENVIRONMENT_ASSET_VERSION,
  ENVIRONMENT_LAYER_Z,
  fxCueSiblingZ,
  fxRendersAboveFloor,
} from '../src/arena';
import { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION } from '../src/assembler/workshopFramePin';
import {
  applyAnimationCommand,
  assemblerLoadoutFromBuild,
  confirmedResultFromDevReplay,
  confirmedResultFromFightResponse,
  confirmedResultFromFightSuccess,
  ConfirmedResultIntegrityError,
  initialPlaybackUi,
  initialPresentationState,
  loadDevGoldenConfirmedResult,
  normalizeHpAfter,
  pauseState,
  playbackUiAfterAdvance,
  progressFromPosition,
  replayContentFits,
  replayIdentityFingerprint,
  reservedReplayChromeHeight,
  DEFAULT_REPLAY_CHROME,
  resolvePlaybackMedia,
  resolveSessionConfirmedResult,
  restartState,
  resumeState,
  sealedBuildsForDevReplay,
  stageViewportFromPlayer,
  togglePlayState,
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

describe('F10 stored builds drive assembler (not scene paintAlias)', () => {
  it('DEV sealed builds use explicit paints opposite illustrative scene aliases', () => {
    const result = loadDevGoldenConfirmedResult(0);
    // Scene near=oxide/crimson, far=petrol/cobalt — sealed builds are inverted.
    expect(result.builds.attacker.paint).toBe('paint-cobalt');
    expect(result.builds.defender.paint).toBe('paint-crimson');
    const near = assemblerLoadoutFromBuild(result.builds.attacker);
    const far = assemblerLoadoutFromBuild(result.builds.defender);
    expect(near.paint).toBe('paint-cobalt');
    expect(far.paint).toBe('paint-crimson');
    expect(near.weapon).toBe(`weapon-${result.replay.fighters[0].weaponKind}`);
    expect(far.weapon).toBe(`weapon-${result.replay.fighters[1].weaponKind}`);
  });

  it('different saved paints produce different assembler loadouts', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const petrolAttacker = sealedBuildsForDevReplay(base.replay.fighters);
    const oxideAttacker = {
      attacker: { ...petrolAttacker.attacker, paint: 'paint-crimson' as const },
      defender: { ...petrolAttacker.defender, paint: 'paint-cobalt' as const },
    };
    expect(assemblerLoadoutFromBuild(petrolAttacker.attacker).paint).toBe('paint-cobalt');
    expect(assemblerLoadoutFromBuild(oxideAttacker.attacker).paint).toBe('paint-crimson');
    expect(assemblerLoadoutFromBuild(oxideAttacker.defender).paint).toBe('paint-cobalt');
  });

  it('older stored media pin is unavailable — not silently substituted', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const historical = confirmedResultFromDevReplay(base.replay, {
      environmentVersion: 'environment-v000',
      kitVersion: ACTIVE_WORKSHOP_FRAME_ASSET_VERSION,
      atlasVersions: { attacker: 'v1', defender: 'v1' },
    });
    const media = resolvePlaybackMedia(historical);
    expect(media.usesStoredVersions).toBe(true);
    expect(media.assetsAvailable).toBe(false);
    expect(media.environmentVersion).toBe('environment-v000');
    expect(media.environmentVersion).not.toBe(ACTIVE_ENVIRONMENT_ASSET_VERSION);
    expect(media.unavailableReason).toMatch(/environment-v000/);
  });

  it('active matching pins remain available', () => {
    const result = loadDevGoldenConfirmedResult(0);
    const media = resolvePlaybackMedia(result);
    expect(media.assetsAvailable).toBe(true);
    expect(media.environmentVersion).toBe(ACTIVE_ENVIRONMENT_ASSET_VERSION);
    expect(media.kitVersion).toBe(ACTIVE_WORKSHOP_FRAME_ASSET_VERSION);
  });
});

describe('F10 FX hierarchy above floor', () => {
  it('places dodge/defeat/hit FX sibling z above opaque floor', () => {
    expect(ENVIRONMENT_LAYER_Z.floor).toBe(10);
    expect(fxCueSiblingZ('dodge')).toBe(ENVIRONMENT_LAYER_Z.dodgeFx);
    expect(fxCueSiblingZ('defeat')).toBe(ENVIRONMENT_LAYER_Z.defeatFx);
    expect(fxCueSiblingZ('hit')).toBe(ENVIRONMENT_LAYER_Z.hitFx);
    expect(fxRendersAboveFloor('dodge')).toBe(true);
    expect(fxRendersAboveFloor('defeat')).toBe(true);
    expect(fxRendersAboveFloor('hit')).toBe(true);
    expect(fxCueSiblingZ('dodge')).toBeGreaterThan(ENVIRONMENT_LAYER_Z.floor);
    expect(fxCueSiblingZ('hit')).toBeGreaterThan(ENVIRONMENT_LAYER_Z.nearActor);
  });
});

describe('F10 stage layout reserves chrome', () => {
  it('short player viewport keeps stage below reserved chrome (no whole-height consume)', () => {
    const playerW = 300;
    const playerH = 280;
    const reserved = reservedReplayChromeHeight(DEFAULT_REPLAY_CHROME, { showResult: true });
    const stage = stageViewportFromPlayer(playerW, playerH, reserved);
    expect(reserved).toBeGreaterThan(100);
    expect(stage.height).toBe(playerH - reserved);
    expect(stage.height).toBeLessThan(playerH);
    expect(stage.height + reserved).toBe(playerH);
    expect(replayContentFits(360, 560, DEFAULT_REPLAY_CHROME, { showResult: true })).toBe(true);
    expect(replayContentFits(300, 280, DEFAULT_REPLAY_CHROME, { showResult: true })).toBe(
      stage.height >= 48,
    );
  });
});

describe('F10 playback pause / progress / restart', () => {
  it('toggle/pause/resume and restart freeze and advance progress without recomputing fight', () => {
    const total = 10;
    let state = initialPlaybackUi(total);
    expect(state.playing).toBe(false);
    expect(state.progress).toBe(0);

    state = resumeState(state);
    expect(state.playing).toBe(true);

    state = playbackUiAfterAdvance(state, 4);
    expect(state.commandIndex).toBe(4);
    expect(state.progress).toBe(progressFromPosition(4, total));
    expect(state.playing).toBe(true);

    state = pauseState(state);
    expect(state.playing).toBe(false);
    expect(state.commandIndex).toBe(4);

    state = togglePlayState(state);
    expect(state.playing).toBe(true);
    expect(state.commandIndex).toBe(4);

    const fingerprintBefore = loadDevGoldenConfirmedResult(0).replay.checksum;
    state = restartState(total);
    expect(state.playing).toBe(true);
    expect(state.commandIndex).toBe(0);
    expect(state.progress).toBe(0);
    expect(loadDevGoldenConfirmedResult(0).replay.checksum).toBe(fingerprintBefore);
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

describe('confirmed result integrity + server mapping', () => {
  it('copies XP/outcome from FightComputeResponse and verifies envelope', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const response = {
      battleId: base.replay.battleId,
      status: 'completed',
      rulesVersion: base.replay.rulesVersion,
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

    const confirmed = confirmedResultFromFightResponse(response, base.builds);
    expect(confirmed.serverConfirmed).toBe(true);
    expect(confirmed.label).toBe('CONFIRMED');
    expect(confirmed.xpAwarded).toBe(2);
    expect(confirmed.allowancesRemaining).toBe(1);
    expect(confirmed.builds.attacker.paint).toBe(base.builds.attacker.paint);
    const media = resolvePlaybackMedia(confirmed);
    expect(media.usesStoredVersions).toBe(true);
  });

  it('rejects tampered checksum before confirmation', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const tampered = {
      ...base.replay,
      checksum: '0'.repeat(64),
    };
    expect(() => confirmedResultFromDevReplay(tampered as typeof base.replay)).toThrow(
      ConfirmedResultIntegrityError,
    );
  });

  it('rejects mismatched battleId / checksum on FightSuccess', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const fight: FightSuccess = {
      battleId: 'other-battle-id',
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
      sealedBuilds: {
        attacker: base.builds.attacker,
        defender: base.builds.defender,
      },
      opponentId: 'opp-sir-bot',
      idempotencyKey: 'idem-test-key-01',
    };
    expect(() => confirmedResultFromFightSuccess(fight)).toThrow(ConfirmedResultIntegrityError);
  });

  it('maps F9 FightSuccess with sealed builds when envelope verifies', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const fight: FightSuccess = {
      battleId: base.battleId,
      status: 'completed',
      rulesVersion: base.rulesVersion,
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
      sealedBuilds: {
        attacker: { ...base.builds.attacker, paint: 'paint-cobalt' },
        defender: { ...base.builds.defender, paint: 'paint-crimson' },
      },
      opponentId: 'opp-sir-bot',
      idempotencyKey: 'idem-test-key-01',
    };
    const confirmed = confirmedResultFromFightSuccess(fight);
    expect(confirmed.serverConfirmed).toBe(true);
    expect(confirmed.xpAwarded).toBe(2);
    expect(confirmed.builds.attacker.paint).toBe('paint-cobalt');
    expect(confirmed.builds.defender.paint).toBe('paint-crimson');
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
    expect(resolved.builds.attacker.paint).toBe('paint-cobalt');
    expect(resolveSessionConfirmedResult(null).label).toBe('DEV');
  });

  it('falls back to DEV when FightSuccess lacks sealedBuilds', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const fight: FightSuccess = {
      battleId: base.battleId,
      status: 'completed',
      rulesVersion: base.rulesVersion,
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
      loadoutVersionIds: { attacker: 'a', defender: 'b' },
      atlasVersions: { attacker: 'v1', defender: 'v1' },
      opponentId: 'opp',
      idempotencyKey: 'idem-no-builds',
    };
    const resolved = resolveSessionConfirmedResult(fight);
    expect(resolved.label).toBe('DEV');
  });
});
