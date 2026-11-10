import { resolveTransportFailureCode } from '../../session-failure';
import type { FightRequestResult, FightSuccess } from './types';

type ErrBody = {
  error?: string;
  message?: string;
  code?: string;
};

export function parseCombatSuccess(
  body: Record<string, unknown>,
  meta: { opponentId: string; idempotencyKey: string },
): FightSuccess | null {
  if (typeof body.battleId !== 'string' || body.battleId.length < 1) return null;
  const outcomeRaw = body.outcome as Record<string, unknown> | undefined;
  const loadoutVersionIds = body.loadoutVersionIds as Record<string, unknown> | undefined;
  const atlasVersions = body.atlasVersions as Record<string, unknown> | undefined;

  return {
    battleId: body.battleId,
    status: 'completed',
    rulesVersion: String(body.rulesVersion ?? 'combat-v1'),
    seed: String(body.seed ?? ''),
    outcome: {
      winner:
        outcomeRaw && typeof outcomeRaw.winner === 'string'
          ? outcomeRaw.winner
          : outcomeRaw?.winner === null
            ? null
            : null,
      reason: String(outcomeRaw?.reason ?? 'defeat'),
    },
    replay: body.replay ?? null,
    replayChecksum: String(body.replayChecksum ?? ''),
    xpAwarded: typeof body.xpAwarded === 'number' ? body.xpAwarded : 0,
    allowancesRemaining:
      typeof body.allowancesRemaining === 'number' ? body.allowancesRemaining : 0,
    utcDay: String(body.utcDay ?? ''),
    repeated: body.repeated === true,
    persistence: String(body.persistence ?? (body.repeated === true ? 'repeated' : 'persisted')),
    loadoutVersionIds: {
      attacker: typeof loadoutVersionIds?.attacker === 'string' ? loadoutVersionIds.attacker : null,
      defender: typeof loadoutVersionIds?.defender === 'string' ? loadoutVersionIds.defender : null,
    },
    atlasVersions: {
      attacker: String(atlasVersions?.attacker ?? 'v1'),
      defender: String(atlasVersions?.defender ?? 'v1'),
    },
    opponentId: meta.opponentId,
    idempotencyKey: meta.idempotencyKey,
  };
}

export function parseCombatError(
  status: number,
  body: ErrBody,
): Extract<FightRequestResult, { ok: false }> {
  const message = body.error ?? body.message ?? `Fight request failed (${status})`;
  const rawCode = body.code ?? `http_${status}`;
  const code = resolveTransportFailureCode({
    code: rawCode,
    message,
    httpStatus: status,
  });
  return {
    ok: false,
    code,
    message,
    httpStatus: status,
    ...(typeof (body as { allowancesRemaining?: unknown }).allowancesRemaining === 'number'
      ? {
          allowancesRemaining: (body as { allowancesRemaining: number }).allowancesRemaining,
        }
      : {}),
  };
}
