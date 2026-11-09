/**
 * Provider + ConfirmFight control regression for final-slot lost-response recovery.
 * Uses FightSessionProvider / GarageSessionProvider + DEV adapters.
 */
import React, { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import TestRenderer, { ReactTestRenderer } from 'react-test-renderer';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import { GarageSessionProvider, useGarageSession } from '../src/garage/LoadoutSessionContext';
import { DevLoadoutSaveAdapter } from '../src/garage/loadout/DevLoadoutSaveAdapter';
import { DevOpponentCandidatesAdapter } from '../src/fight/candidates/DevOpponentCandidatesAdapter';
import {
  DevFightBackendState,
  resetSharedDevFightBackend,
} from '../src/fight/dev/DevFightBackendState';
import { FightSessionProvider, useFightSession } from '../src/fight/FightSessionContext';
import { computeConfirmFightControls } from '../src/fight/fightSessionLifecycle';
import { DevFightRequestAdapter } from '../src/fight/request/DevFightRequestAdapter';
import type { FightRequestPort } from '../src/fight/request/FightRequestPort';
import type { FightIntent } from '../src/fight/request/idempotency';
import type {
  FightRequestInput,
  FightRequestResult,
  FightSuccess,
} from '../src/fight/request/types';

type ProbeApi = {
  getControls: () => ReturnType<typeof computeConfirmFightControls>;
  selectSir: () => void;
  startFight: () => Promise<FightSuccess | null>;
  refresh: () => Promise<void>;
  getPendingIntent: () => FightIntent | null;
  getAllowances: () => number | null;
  canProgress: () => boolean;
  booting: () => boolean;
};

function ConfirmRecoveryProbe(props: { apiRef: { current: ProbeApi | null } }): null {
  const garage = useGarageSession();
  const fight = useFightSession();

  const allowances =
    fight.submit.status === 'error' && fight.submit.allowancesRemaining !== undefined
      ? fight.submit.allowancesRemaining
      : fight.list.status === 'ready'
        ? fight.list.allowancesRemaining
        : null;

  props.apiRef.current = {
    getControls: () =>
      computeConfirmFightControls({
        canProgress: garage.canProgress,
        hasConfirmedLoadout: garage.loadout.confirmedLoadout !== null,
        submitting: fight.submit.status === 'submitting' || fight.fightInFlight,
        sessionPresent: !!garage.session,
        allowances,
        submitStatus: fight.submit.status,
        submitCode: fight.submit.status === 'error' ? fight.submit.code : null,
        pendingIntent: fight.pendingIntent,
        selectedOpponentId: fight.selected?.characterId ?? null,
      }),
    selectSir: () => {
      const sir =
        fight.list.status === 'ready'
          ? fight.list.candidates.find((c) => c.characterId === 'opp-sir-bot')
          : null;
      if (sir) fight.selectOpponent(sir);
    },
    startFight: () => fight.startFight(),
    refresh: () => fight.refreshCandidates(),
    getPendingIntent: () => fight.pendingIntent,
    getAllowances: () => allowances,
    canProgress: () => garage.canProgress,
    booting: () => garage.booting,
  };
  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Drop the first successful response after the server commit (lost HTTP). */
class LostResponseFightPort implements FightRequestPort {
  readonly kind = 'dev' as const;
  dropNextSuccess = false;
  constructor(private readonly inner: DevFightRequestAdapter) {}
  requestFight(input: FightRequestInput): Promise<FightRequestResult> {
    return this.inner.requestFight(input).then((result) => {
      if (this.dropNextSuccess && result.ok) {
        this.dropNextSuccess = false;
        return {
          ok: false as const,
          code: 'network_error',
          message: 'lost response after commit',
        };
      }
      return result;
    });
  }
}

afterEach(() => {
  resetSharedDevFightBackend(3);
});

describe('ConfirmFight final-slot recovery (provider remount)', () => {
  it('keeps Start/Retry enabled at zero eligibility and recovers original result', async () => {
    const backend = new DevFightBackendState(1);
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);

    const loadouts = new DevLoadoutSaveAdapter();
    const candidates = new DevOpponentCandidatesAdapter(backend);
    const baseFights = new DevFightRequestAdapter(backend);
    const fights = new LostResponseFightPort(baseFights);
    const apiRef: { current: ProbeApi | null } = { current: null };

    let root!: ReactTestRenderer;
    await act(async () => {
      root = TestRenderer.create(
        <GarageSessionProvider auth={auth} loadouts={loadouts}>
          <FightSessionProvider candidates={candidates} fights={fights}>
            <ConfirmRecoveryProbe apiRef={apiRef} />
          </FightSessionProvider>
        </GarageSessionProvider>,
      );
    });

    const api = () => {
      if (!apiRef.current) throw new Error('probe not mounted');
      return apiRef.current;
    };

    for (let i = 0; i < 40 && (api().booting() || !api().canProgress()); i += 1) {
      await flush();
    }
    expect(api().booting()).toBe(false);
    expect(api().canProgress()).toBe(true);

    await act(async () => {
      await api().refresh();
    });
    await flush();
    api().selectSir();
    await flush();

    fights.dropNextSuccess = true;
    let firstResult: FightSuccess | null = null;
    await act(async () => {
      firstResult = await api().startFight();
    });
    await flush();

    // Client saw network failure; server committed (allowance 0); intent retained.
    expect(firstResult).toBeNull();
    expect(backend.allowancesRemaining).toBe(0);
    expect(backend.fightsByKey.size).toBe(1);
    const retained = api().getPendingIntent();
    expect(retained?.opponentId).toBe('opp-sir-bot');
    expect(retained?.idempotencyKey).toBeTruthy();

    // Remount Confirm path: refresh eligibility/list at zero unused allowance.
    await act(async () => {
      await api().refresh();
    });
    await flush();
    api().selectSir();
    await flush();
    expect(api().getPendingIntent()?.idempotencyKey).toBe(retained!.idempotencyKey);
    expect(api().getAllowances()).toBe(0);

    const controls = api().getControls();
    expect(controls.recoverable).toBe(true);
    expect(controls.startDisabled).toBe(false);
    expect(controls.showRetry).toBe(true);
    expect(controls.retryDisabled).toBe(false);

    let recovered: FightSuccess | null = null;
    await act(async () => {
      recovered = await api().startFight();
    });
    await flush();

    expect(recovered).not.toBeNull();
    expect(recovered!.repeated).toBe(true);
    expect(recovered!.idempotencyKey).toBe(retained!.idempotencyKey);
    expect(backend.allowancesRemaining).toBe(0);
    expect(backend.fightsByKey.size).toBe(1);

    root.unmount();
  });
});
