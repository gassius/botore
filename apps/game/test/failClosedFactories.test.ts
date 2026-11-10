import { afterEach, describe, expect, it } from 'vitest';
import { createOpponentCandidatesClient } from '../src/fight/candidates/createOpponentCandidatesClient';
import { createFightRequestClient } from '../src/fight/request/createFightRequestClient';
import { createAuthClient } from '../src/garage/auth/createAuthClient';
import { createLoadoutSaveClient } from '../src/garage/loadout/createLoadoutSaveClient';
import { createRankingReadClient } from '../src/ranking/createRankingReadClient';
import { FixtureRankingReadAdapter } from '../src/ranking/adapters/FixtureRankingReadAdapter';
import { UnavailableContractRankingReadAdapter } from '../src/ranking/adapters/UnavailableContractRankingReadAdapter';
import {
  isDevScaffoldAllowed,
  isPlayableFailClosed,
  PLAYABLE_MISCONFIGURED_CODE,
} from '../src/runtime/devScaffoldPolicy';
import { resolveSessionConfirmedResult } from '../src/replay/resolveSessionResult';

const ENV_KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD',
  'EXPO_PUBLIC_DESIGN_CAPTURE',
  'EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED',
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

function snapshotEnv(): Record<EnvKey, string | undefined> {
  const out = {} as Record<EnvKey, string | undefined>;
  for (const key of ENV_KEYS) out[key] = process.env[key];
  return out;
}

function restoreEnv(snap: Record<EnvKey, string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = snap[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearPublicEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe('C8 fail-closed playable factory selection', () => {
  const previous = snapshotEnv();

  afterEach(() => {
    restoreEnv(previous);
  });

  it('allows DEV scaffolds for design-capture and explicit ALLOW_DEV_SCAFFOLD', () => {
    clearPublicEnv();
    expect(isDevScaffoldAllowed({ metroDev: false })).toBe(false);
    expect(isPlayableFailClosed({ metroDev: false })).toBe(true);

    expect(
      isDevScaffoldAllowed({
        allowDevScaffold: '1',
        metroDev: false,
      }),
    ).toBe(true);

    expect(
      isDevScaffoldAllowed({
        designCapture: '1',
        metroDev: false,
      }),
    ).toBe(true);

    expect(
      isDevScaffoldAllowed({
        designCapture: '1',
        designCaptureFailClosed: '1',
        metroDev: false,
      }),
    ).toBe(false);

    expect(isDevScaffoldAllowed({ metroDev: true })).toBe(true);
  });

  it('selects unavailable adapters when fail-closed and Supabase env unset', () => {
    clearPublicEnv();
    // Force non-Metro playable profile (preview/production).
    process.env.EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD = '0';
    process.env.EXPO_PUBLIC_DESIGN_CAPTURE = '0';
    process.env.EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED = '1';

    expect(createAuthClient().kind).toBe('unavailable');
    expect(createLoadoutSaveClient().kind).toBe('unavailable');
    expect(createOpponentCandidatesClient().kind).toBe('unavailable');
    expect(createFightRequestClient().kind).toBe('unavailable');
    expect(createRankingReadClient()).toBeInstanceOf(UnavailableContractRankingReadAdapter);
  });

  it('selects DEV adapters when ALLOW_DEV_SCAFFOLD is set and env unset', () => {
    clearPublicEnv();
    process.env.EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD = '1';

    expect(createAuthClient().kind).toBe('dev');
    expect(createLoadoutSaveClient().kind).toBe('dev');
    expect(createOpponentCandidatesClient().kind).toBe('dev');
    expect(createFightRequestClient().kind).toBe('dev');
    expect(createRankingReadClient()).toBeInstanceOf(FixtureRankingReadAdapter);
  });

  it('selects DEV adapters when design-capture is enabled and env unset', () => {
    clearPublicEnv();
    process.env.EXPO_PUBLIC_DESIGN_CAPTURE = '1';

    expect(createAuthClient().kind).toBe('dev');
    expect(createOpponentCandidatesClient().kind).toBe('dev');
    expect(createFightRequestClient().kind).toBe('dev');
  });

  it('selects live adapters when Supabase public env is present', () => {
    clearPublicEnv();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
    process.env.EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED = '1';

    expect(createAuthClient().kind).toBe('supabase');
    expect(createLoadoutSaveClient().kind).toBe('supabase');
    expect(createOpponentCandidatesClient().kind).toBe('supabase');
    expect(createFightRequestClient().kind).toBe('supabase');
    expect(createRankingReadClient({ accessToken: 'jwt' }).constructor.name).toBe(
      'SupabaseRankingReadAdapter',
    );
  });

  it('unavailable fight adapter returns playable_misconfigured', async () => {
    clearPublicEnv();
    process.env.EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED = '1';
    const fights = createFightRequestClient();
    expect(fights.kind).toBe('unavailable');
    const result = await fights.requestFight({
      accessToken: 'x',
      opponentId: 'opp',
      idempotencyKey: 'idem',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(PLAYABLE_MISCONFIGURED_CODE);
  });

  it('unavailable auth refuses password sign-in with playable_misconfigured (no DEV)', async () => {
    clearPublicEnv();
    process.env.EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED = '1';
    const auth = createAuthClient();
    expect(auth.kind).toBe('unavailable');
    const result = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(PLAYABLE_MISCONFIGURED_CODE);
  });

  it('does not load DEV golden via resolveSessionConfirmedResult when fail-closed', () => {
    clearPublicEnv();
    process.env.EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED = '1';
    expect(resolveSessionConfirmedResult(null)).toBeNull();
  });

  it('loads labelled DEV golden via resolveSessionConfirmedResult when scaffolds allowed', () => {
    clearPublicEnv();
    process.env.EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD = '1';
    const resolved = resolveSessionConfirmedResult(null);
    expect(resolved).not.toBeNull();
    expect(resolved?.label).toBe('DEV');
    expect(resolved?.serverConfirmed).toBe(false);
    expect(resolved?.xpAwarded).toBeNull();
  });
});
