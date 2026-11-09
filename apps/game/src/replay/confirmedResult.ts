/**
 * Confirmed fight result / progression — only from server-confirmed data.
 * Prefer F9 `FightSuccess` / FightComputeResponse when present; otherwise DEV
 * golden fixtures. Never invent XP, allowances, or outcomes from art.
 */
import {
  ReplayValidationError,
  validateReplay,
  verifyReplay,
  type BattleOutcome,
  type BattleReplay,
} from '@botore/replay';
import type { FightComputeResponse } from '@botore/contracts';
import type { FightSuccess } from '../fight/request/types';
import { ACTIVE_ENVIRONMENT_ASSET_VERSION } from '../arena/environmentPin';
import { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION } from '../assembler/workshopFramePin';
import { sealedBuildsForDevReplay, type SealedFightBuilds } from './fighterLoadout';

export type ResultSource = 'server' | 'dev-fixture';

export interface HistoricalMediaVersions {
  readonly environmentVersion: string;
  readonly kitVersion: string;
  readonly atlasVersions?: {
    readonly attacker: string;
    readonly defender: string;
  };
  readonly loadoutVersionIds?: {
    readonly attacker: string;
    readonly defender: string;
  };
}

export interface ConfirmedFightResult {
  readonly source: ResultSource;
  /** Always true for server; DEV fixtures must set false and label UI. */
  readonly serverConfirmed: boolean;
  readonly battleId: string;
  readonly rulesVersion: string;
  readonly replayChecksum: string;
  readonly outcome: BattleOutcome;
  readonly xpAwarded: number | null;
  readonly allowancesRemaining: number | null;
  readonly utcDay: string | null;
  readonly persistence: 'persisted' | 'repeated' | null;
  readonly media: HistoricalMediaVersions;
  /** Authoritative sealed builds for assembler — not scene paint aliases. */
  readonly builds: SealedFightBuilds;
  readonly replay: BattleReplay;
  readonly label: 'CONFIRMED' | 'DEV';
}

export class ConfirmedResultIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfirmedResultIntegrityError';
  }
}

function outcomeFromReplay(replay: BattleReplay): BattleOutcome {
  return replay.outcome;
}

function assertVerified(replay: BattleReplay): void {
  try {
    verifyReplay(replay);
  } catch (err) {
    if (err instanceof ReplayValidationError) {
      throw new ConfirmedResultIntegrityError(err.message);
    }
    throw err;
  }
}

function assertReplayEnvelope(
  replay: BattleReplay,
  expected: { battleId: string; rulesVersion: string; replayChecksum: string },
): void {
  assertVerified(replay);
  if (replay.battleId !== expected.battleId) {
    throw new ConfirmedResultIntegrityError(
      `replay battleId mismatch: envelope=${replay.battleId} response=${expected.battleId}`,
    );
  }
  if (replay.rulesVersion !== expected.rulesVersion) {
    throw new ConfirmedResultIntegrityError(
      `replay rulesVersion mismatch: envelope=${replay.rulesVersion} response=${expected.rulesVersion}`,
    );
  }
  const checksum = expected.replayChecksum || replay.checksum;
  if (checksum !== replay.checksum) {
    throw new ConfirmedResultIntegrityError(
      `replay checksum mismatch: envelope=${replay.checksum} response=${checksum}`,
    );
  }
}

function buildsFromFightSuccess(fight: FightSuccess): SealedFightBuilds {
  if (!fight.sealedBuilds) {
    throw new ConfirmedResultIntegrityError(
      'sealedBuilds required — refuse scene-slot paint substitution for confirmed fights',
    );
  }
  return {
    attacker: {
      ...fight.sealedBuilds.attacker,
      loadoutVersionId:
        fight.sealedBuilds.attacker.loadoutVersionId ?? fight.loadoutVersionIds.attacker,
      atlasVersion: fight.sealedBuilds.attacker.atlasVersion ?? fight.atlasVersions.attacker,
    },
    defender: {
      ...fight.sealedBuilds.defender,
      loadoutVersionId:
        fight.sealedBuilds.defender.loadoutVersionId ?? fight.loadoutVersionIds.defender,
      atlasVersion: fight.sealedBuilds.defender.atlasVersion ?? fight.atlasVersions.defender,
    },
  };
}

/**
 * Build a confirmed result from a live FightComputeResponse.
 * Presentation must not alter outcome / XP / allowances.
 */
export function confirmedResultFromFightResponse(
  response: FightComputeResponse,
  builds?: SealedFightBuilds,
): ConfirmedFightResult {
  const replay = validateReplay(response.replay);
  assertReplayEnvelope(replay, {
    battleId: response.battleId,
    rulesVersion: response.rulesVersion,
    replayChecksum: response.replayChecksum,
  });
  return {
    source: 'server',
    serverConfirmed: true,
    battleId: response.battleId,
    rulesVersion: response.rulesVersion,
    replayChecksum: response.replayChecksum,
    outcome: outcomeFromReplay(replay),
    xpAwarded: response.xpAwarded,
    allowancesRemaining: response.allowancesRemaining,
    utcDay: response.utcDay,
    persistence: response.persistence,
    media: {
      environmentVersion: ACTIVE_ENVIRONMENT_ASSET_VERSION,
      kitVersion: ACTIVE_WORKSHOP_FRAME_ASSET_VERSION,
      atlasVersions: response.atlasVersions,
      loadoutVersionIds: response.loadoutVersionIds,
    },
    builds: builds ?? sealedBuildsForDevReplay(replay.fighters),
    replay,
    label: 'CONFIRMED',
  };
}

/**
 * Map F9 `FightSuccess` (combat-v1 response) → confirmed presentation model.
 * Outcome comes from the sealed replay; XP/allowances from the server payload only.
 */
export function confirmedResultFromFightSuccess(fight: FightSuccess): ConfirmedFightResult {
  const replay = validateReplay(fight.replay);
  assertReplayEnvelope(replay, {
    battleId: fight.battleId,
    rulesVersion: fight.rulesVersion,
    replayChecksum: fight.replayChecksum || (fight.replay as BattleReplay).checksum,
  });
  const loadoutVersionIds =
    typeof fight.loadoutVersionIds.attacker === 'string' &&
    typeof fight.loadoutVersionIds.defender === 'string'
      ? {
          attacker: fight.loadoutVersionIds.attacker,
          defender: fight.loadoutVersionIds.defender,
        }
      : undefined;
  const persistence =
    fight.persistence === 'persisted' || fight.persistence === 'repeated'
      ? fight.persistence
      : fight.repeated
        ? 'repeated'
        : 'persisted';
  return {
    source: 'server',
    serverConfirmed: true,
    battleId: fight.battleId,
    rulesVersion: fight.rulesVersion,
    replayChecksum: fight.replayChecksum || replay.checksum,
    outcome: outcomeFromReplay(replay),
    xpAwarded: fight.xpAwarded,
    allowancesRemaining: fight.allowancesRemaining,
    utcDay: fight.utcDay,
    persistence,
    media: {
      environmentVersion: ACTIVE_ENVIRONMENT_ASSET_VERSION,
      kitVersion: ACTIVE_WORKSHOP_FRAME_ASSET_VERSION,
      atlasVersions: fight.atlasVersions,
      ...(loadoutVersionIds ? { loadoutVersionIds } : {}),
    },
    builds: buildsFromFightSuccess(fight),
    replay,
    label: 'CONFIRMED',
  };
}

/**
 * DEV-only: wrap a sealed recorded replay from @botore/replay / golden fixtures.
 * XP / allowances stay null — never fake completed backend progression.
 */
export function confirmedResultFromDevReplay(
  replay: BattleReplay,
  media?: Partial<HistoricalMediaVersions>,
  builds?: SealedFightBuilds,
): ConfirmedFightResult {
  assertVerified(replay);
  return {
    source: 'dev-fixture',
    serverConfirmed: false,
    battleId: replay.battleId,
    rulesVersion: replay.rulesVersion,
    replayChecksum: replay.checksum,
    outcome: outcomeFromReplay(replay),
    xpAwarded: null,
    allowancesRemaining: null,
    utcDay: null,
    persistence: null,
    media: {
      environmentVersion: media?.environmentVersion ?? ACTIVE_ENVIRONMENT_ASSET_VERSION,
      kitVersion: media?.kitVersion ?? ACTIVE_WORKSHOP_FRAME_ASSET_VERSION,
      ...(media?.atlasVersions ? { atlasVersions: media.atlasVersions } : {}),
      ...(media?.loadoutVersionIds ? { loadoutVersionIds: media.loadoutVersionIds } : {}),
    },
    builds: builds ?? sealedBuildsForDevReplay(replay.fighters),
    replay,
    label: 'DEV',
  };
}

export type PlaybackMediaResolution = {
  readonly environmentVersion: string;
  readonly kitVersion: string;
  readonly usesStoredVersions: boolean;
  /**
   * When false, historical pins are not present in the client pack —
   * do not silently render the active substitute as that historical fight.
   */
  readonly assetsAvailable: boolean;
  readonly unavailableReason: string | null;
};

/** Resolve which media pin to render. Historical fights must keep stored versions when present. */
export function resolvePlaybackMedia(result: ConfirmedFightResult): PlaybackMediaResolution {
  const environmentVersion = result.media.environmentVersion;
  const kitVersion = result.media.kitVersion;
  const usesStoredVersions =
    environmentVersion !== ACTIVE_ENVIRONMENT_ASSET_VERSION ||
    kitVersion !== ACTIVE_WORKSHOP_FRAME_ASSET_VERSION ||
    Boolean(result.media.atlasVersions) ||
    Boolean(result.media.loadoutVersionIds);

  const envOk = environmentVersion === ACTIVE_ENVIRONMENT_ASSET_VERSION;
  const kitOk = kitVersion === ACTIVE_WORKSHOP_FRAME_ASSET_VERSION;
  if (!envOk || !kitOk) {
    return {
      environmentVersion,
      kitVersion,
      usesStoredVersions: true,
      assetsAvailable: false,
      unavailableReason: !envOk
        ? `Historical environment ${environmentVersion} not packed (active ${ACTIVE_ENVIRONMENT_ASSET_VERSION})`
        : `Historical kit ${kitVersion} not packed (active ${ACTIVE_WORKSHOP_FRAME_ASSET_VERSION})`,
    };
  }

  return {
    environmentVersion,
    kitVersion,
    usesStoredVersions,
    assetsAvailable: true,
    unavailableReason: null,
  };
}

export function formatOutcomeLine(outcome: BattleOutcome): string {
  if (outcome.reason === 'action_limit_tiebreak') {
    return outcome.winnerByTiebreak
      ? `Tiebreak → ${outcome.winnerByTiebreak}`
      : 'Action-limit draw';
  }
  return outcome.winner ? `Winner: ${outcome.winner}` : 'No winner';
}
