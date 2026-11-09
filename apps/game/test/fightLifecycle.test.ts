import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevOpponentCandidatesAdapter } from '../src/fight/candidates/DevOpponentCandidatesAdapter';
import { summarizeAllowanceRows } from '../src/fight/candidates/allowanceSummary';
import { SupabaseOpponentCandidatesAdapter } from '../src/fight/candidates/SupabaseOpponentCandidatesAdapter';
import {
  DevFightBackendState,
  resetSharedDevFightBackend,
} from '../src/fight/dev/DevFightBackendState';
import {
  canContinueToConfirm,
  canJoinInFlight,
  computeConfirmFightControls,
  intentAfterFightResult,
  isStartFightDisabled,
  shouldAcceptFightNavigation,
  shouldPreserveUnresolvedIntent,
} from '../src/fight/fightSessionLifecycle';
import { DevFightRequestAdapter } from '../src/fight/request/DevFightRequestAdapter';
import { createFightIdempotencyKey, resolveFightIntent } from '../src/fight/request/idempotency';
import type { FightSuccess } from '../src/fight/request/types';
import type { OpponentCandidate } from '../src/fight/candidates/types';
import { DEFAULT_CONFIRMED_LOADOUT } from '../src/garage/loadout/proofCatalogue';
import { loadDevGoldenConfirmedResult } from '../src/replay/loadDevReplay';

const sir: OpponentCandidate = {
  characterId: 'opp-sir-bot',
  displayName: 'Sir Bot',
  loadout: { ...DEFAULT_CONFIRMED_LOADOUT, paint: 'paint-cobalt', weapon: 'weapon-sword' },
  loadoutVersionId: 'dev-opp-sir',
  atlasVersion: 'v1',
};

const dex: OpponentCandidate = {
  characterId: 'opp-dex-bot',
  displayName: 'Dex Bot',
  loadout: { ...DEFAULT_CONFIRMED_LOADOUT, paint: 'paint-crimson', weapon: 'weapon-dagger' },
  loadoutVersionId: 'dev-opp-dex',
  atlasVersion: 'v1',
};

afterEach(() => {
  resetSharedDevFightBackend(3);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('unresolved intent preservation (P1)', () => {
  it('keeps same-opponent intent across reselection after lost response', async () => {
    const backend = new DevFightBackendState(3);
    const fights = new DevFightRequestAdapter(backend);
    const intent = resolveFightIntent(null, 'opp-sir-bot');

    const first = await fights.requestFight({
      accessToken: 't',
      opponentId: 'opp-sir-bot',
      idempotencyKey: intent.idempotencyKey,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(backend.allowancesRemaining).toBe(2);

    // Simulate lost response: client still holds unresolved intent; UI reselects same opponent.
    expect(shouldPreserveUnresolvedIntent(intent, 'opp-sir-bot')).toBe(true);
    const afterReselect = resolveFightIntent(intent, 'opp-sir-bot');
    expect(afterReselect.idempotencyKey).toBe(intent.idempotencyKey);

    const retry = await fights.requestFight({
      accessToken: 't',
      opponentId: 'opp-sir-bot',
      idempotencyKey: afterReselect.idempotencyKey,
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.fight.repeated).toBe(true);
    expect(retry.fight.battleId).toBe(first.fight.battleId);
    expect(backend.allowancesRemaining).toBe(2);
  });

  it('recovers final-slot commit when refreshed unused allowance is zero', async () => {
    const backend = new DevFightBackendState(1);
    const fights = new DevFightRequestAdapter(backend);
    const candidates = new DevOpponentCandidatesAdapter(backend);
    const intent = resolveFightIntent(null, 'opp-sir-bot');

    const first = await fights.requestFight({
      accessToken: 't',
      opponentId: 'opp-sir-bot',
      idempotencyKey: intent.idempotencyKey,
    });
    expect(first.ok).toBe(true);
    expect(backend.allowancesRemaining).toBe(0);

    const list = await candidates.listCandidates({
      accessToken: 't',
      accountId: '00000000-0000-4000-8000-000000000001',
    });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.allowancesRemaining).toBe(0);

    expect(
      canContinueToConfirm({
        selected: sir,
        listReady: true,
        emptyCandidates: false,
        allowancesRemaining: list.allowancesRemaining,
        pendingIntent: intent,
      }),
    ).toBe(true);

    // Remounted Confirm at zero eligibility must keep Start/Retry actionable.
    const controls = computeConfirmFightControls({
      canProgress: true,
      hasConfirmedLoadout: true,
      submitting: false,
      sessionPresent: true,
      allowances: 0,
      submitStatus: 'idle',
      submitCode: null,
      pendingIntent: intent,
      selectedOpponentId: 'opp-sir-bot',
    });
    expect(controls.recoverable).toBe(true);
    expect(controls.startDisabled).toBe(false);
    expect(controls.showRetry).toBe(true);
    expect(controls.retryDisabled).toBe(false);

    // Without retained intent, zero eligibility still blocks a *new* fight.
    expect(
      computeConfirmFightControls({
        canProgress: true,
        hasConfirmedLoadout: true,
        submitting: false,
        sessionPresent: true,
        allowances: 0,
        submitStatus: 'idle',
        submitCode: null,
        pendingIntent: null,
        selectedOpponentId: 'opp-sir-bot',
      }).startDisabled,
    ).toBe(true);

    const recovered = await fights.requestFight({
      accessToken: 't',
      opponentId: 'opp-sir-bot',
      idempotencyKey: intent.idempotencyKey,
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.fight.repeated).toBe(true);
    expect(recovered.fight.battleId).toBe(first.ok ? first.fight.battleId : '');
    expect(backend.allowancesRemaining).toBe(0);
  });
});

describe('foreign in-flight must not be joined (P1)', () => {
  it('joins only same-opponent flights and rejects navigating with stale A result for B', async () => {
    const backend = new DevFightBackendState(3);
    const fights = new DevFightRequestAdapter(backend);
    fights.delayMs = 40;

    const intentA = resolveFightIntent(null, 'opp-sir-bot');
    let resolveGate!: () => void;
    const gate = new Promise<void>((r) => {
      resolveGate = r;
    });

    // Start A with artificial delay by wrapping the adapter call.
    const promiseA = (async () => {
      await gate;
      const res = await fights.requestFight({
        accessToken: 't',
        opponentId: 'opp-sir-bot',
        idempotencyKey: intentA.idempotencyKey,
      });
      return res.ok ? res.fight : null;
    })();

    const inFlightA = {
      opponentId: 'opp-sir-bot',
      idempotencyKey: intentA.idempotencyKey,
      promise: promiseA,
    };

    expect(canJoinInFlight(inFlightA, 'opp-sir-bot')).toBe(true);
    expect(canJoinInFlight(inFlightA, 'opp-dex-bot')).toBe(false);

    // B must not join A's promise.
    resolveGate();
    const fightA = await promiseA;
    expect(fightA?.opponentId).toBe('opp-sir-bot');

    expect(
      shouldAcceptFightNavigation({
        fight: fightA,
        expectedOpponentId: 'opp-dex-bot',
        navigationGeneration: 1,
        activeNavigationGeneration: 1,
      }),
    ).toBe(false);

    expect(
      shouldAcceptFightNavigation({
        fight: fightA,
        expectedOpponentId: 'opp-sir-bot',
        navigationGeneration: 1,
        activeNavigationGeneration: 2, // Back bumped generation
      }),
    ).toBe(false);

    // DEV scaffold is never first-run playback-ready (no sealed combat-v1 replay).
    expect(
      shouldAcceptFightNavigation({
        fight: fightA,
        expectedOpponentId: 'opp-sir-bot',
        navigationGeneration: 1,
        activeNavigationGeneration: 1,
      }),
    ).toBe(false);

    expect(shouldPreserveUnresolvedIntent(intentA, dex.characterId)).toBe(false);
  });

  it('accepts navigation when FightSuccess carries sealed builds + validateable replay', () => {
    const base = loadDevGoldenConfirmedResult(0);
    const live: FightSuccess = {
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
        attacker: {
          chassis: 'chassis-basic',
          paint: 'paint-oxide',
          weapon: 'weapon-axe',
          loadoutVersionId: 'garage-attacker',
          atlasVersion: 'v1',
        },
        defender: {
          chassis: 'chassis-basic',
          paint: 'paint-petrol',
          weapon: 'weapon-sword',
          loadoutVersionId: 'garage-defender',
          atlasVersion: 'v1',
        },
      },
      opponentId: 'opp-sir-bot',
      idempotencyKey: 'idem-live-accept',
    };

    expect(
      shouldAcceptFightNavigation({
        fight: live,
        expectedOpponentId: 'opp-sir-bot',
        navigationGeneration: 3,
        activeNavigationGeneration: 3,
      }),
    ).toBe(true);
  });
});

describe('shared DEV allowance (P2)', () => {
  it('keeps roster and fight adapters on one allowance balance across Back→refresh', async () => {
    const backend = resetSharedDevFightBackend(3);
    const candidates = new DevOpponentCandidatesAdapter(backend);
    const fights = new DevFightRequestAdapter(backend);

    const key = createFightIdempotencyKey();
    const fight = await fights.requestFight({
      accessToken: 't',
      opponentId: 'opp-sir-bot',
      idempotencyKey: key,
    });
    expect(fight.ok).toBe(true);
    expect(fights.allowancesRemaining).toBe(2);

    const list = await candidates.listCandidates({
      accessToken: 't',
      accountId: '00000000-0000-4000-8000-000000000001',
    });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.allowancesRemaining).toBe(2);

    const elig = await candidates.prepareEligibility({
      accessToken: 't',
      accountId: '00000000-0000-4000-8000-000000000001',
      opponentId: 'opp-sir-bot',
    });
    expect(elig.ok).toBe(true);
    if (!elig.ok) return;
    expect(elig.allowancesRemaining).toBe(2);
  });
});

describe('allowance_exhausted without numeric counter (P2)', () => {
  it('disables Start for Edge-shaped {code: allowance_exhausted} with no remaining field', () => {
    expect(
      isStartFightDisabled({
        submitting: false,
        sessionPresent: true,
        allowances: 2, // stale eligibility count
        submitCode: 'allowance_exhausted',
      }),
    ).toBe(true);
  });

  it('maps intent clear on exhaustion; keeps intent on network_error', () => {
    const prior = resolveFightIntent(null, 'opp-sir-bot');
    expect(
      intentAfterFightResult({ prior, resultOk: false, code: 'allowance_exhausted' }),
    ).toBeNull();
    expect(intentAfterFightResult({ prior, resultOk: false, code: 'network_error' })).toEqual(
      prior,
    );
  });
});

describe('server-derived allowance day (P2)', () => {
  it('summarizes unused slots on the latest server utc_day, ignoring device clock', () => {
    const summary = summarizeAllowanceRows([
      { utc_day: '2026-11-09', used_at: null },
      { utc_day: '2026-11-09', used_at: null },
      { utc_day: '2026-11-09', used_at: '2026-11-09T01:00:00Z' },
      { utc_day: '2026-11-10', used_at: null },
    ]);
    // Latest day present is 2026-11-10 with 1 unused.
    expect(summary.utcDay).toBe('2026-11-10');
    expect(summary.allowancesRemaining).toBe(1);
  });

  it('uses B RPCs for roster + allowance summary (no table SELECTs / device day filter)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T12:00:00.000Z'));

    const fetches: string[] = [];
    const bodies: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetches.push(url);
        if (init?.body) bodies.push({ url, body: JSON.parse(String(init.body)) });
        if (url.includes('/rpc/list_opponent_roster')) {
          return new Response(
            JSON.stringify({
              ok: true,
              opponents: [{ characterId: 'opp-sir-bot', displayName: 'Sir Bot' }],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/rpc/get_fight_allowance_summary')) {
          return new Response(
            JSON.stringify({
              ok: true,
              utcDay: '2026-11-09',
              allowancesRemaining: 3,
            }),
            { status: 200 },
          );
        }
        if (url.includes('/current_bot_loadouts')) {
          return new Response(
            JSON.stringify([
              {
                character_id: 'opp-sir-bot',
                loadout_version_id: 'v',
                atlas_version: 'v1',
                loadout: {
                  chassis: 'chassis-basic',
                  paint: 'paint-cobalt',
                  weapon: 'weapon-sword',
                },
              },
            ]),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 404 });
      }),
    );

    const adapter = new SupabaseOpponentCandidatesAdapter({
      url: 'http://127.0.0.1:54321',
      anonKey: 'eyJ.anon.fake',
    });
    const result = await adapter.listCandidates({
      accessToken: 'user-jwt',
      accountId: '00000000-0000-4000-8000-000000000001',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.utcDay).toBe('2026-11-09');
    expect(result.allowancesRemaining).toBe(3);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.characterId).toBe('opp-sir-bot');
    expect(fetches.some((u) => u.includes('/rest/v1/characters'))).toBe(false);
    expect(fetches.some((u) => u.includes('/rest/v1/fight_allowances'))).toBe(false);
    expect(fetches.some((u) => u.includes('/rpc/list_opponent_roster'))).toBe(true);
    expect(fetches.some((u) => u.includes('/rpc/get_fight_allowance_summary'))).toBe(true);
    const allowanceBodies = bodies.filter((b) =>
      b.url.includes('/rpc/get_fight_allowance_summary'),
    );
    expect(allowanceBodies).toHaveLength(1);
    expect(allowanceBodies[0]?.body).toEqual({
      p_account_id: '00000000-0000-4000-8000-000000000001',
    });
    vi.useRealTimers();
  });
});
