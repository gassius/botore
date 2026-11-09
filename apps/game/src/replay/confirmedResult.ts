/**
 * Confirmed fight result / progression — only from server-confirmed data.
 * Prefer F9 `FightSuccess` / FightComputeResponse when present; otherwise DEV
 * golden fixtures. Never invent XP, allowances, or outcomes from art.
 */
import { validateReplay, type BattleOutcome, type BattleReplay } from '@botore/replay';
import type { FightComputeResponse } from '@botore/contracts';
import type { FightSuccess } from '../fight/request/types';
import { ACTIVE_ENVIRONMENT_ASSET_VERSION } from '../arena/environmentPin';
import { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION } from '../assembler/workshopFramePin';

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
  readonly replay: BattleReplay;
  readonly label: 'CONFIRMED' | 'DEV';
}

function outcomeFromReplay(replay: BattleReplay): BattleOutcome {
  return replay.outcome;
}

/**
 * Build a confirmed result from a live FightComputeResponse.
 * Presentation must not alter outcome / XP / allowances.
 */
export function confirmedResultFromFightResponse(
  response: FightComputeResponse,
): ConfirmedFightResult {
  const replay = validateReplay(response.replay);
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
): ConfirmedFightResult {
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
    replay,
    label: 'DEV',
  };
}

/** Resolve which media pin to render. Historical fights must keep stored versions when present. */
export function resolvePlaybackMedia(result: ConfirmedFightResult): {
  environmentVersion: string;
  kitVersion: string;
  usesStoredVersions: boolean;
} {
  const environmentVersion = result.media.environmentVersion;
  const kitVersion = result.media.kitVersion;
  const usesStoredVersions =
    environmentVersion !== ACTIVE_ENVIRONMENT_ASSET_VERSION ||
    kitVersion !== ACTIVE_WORKSHOP_FRAME_ASSET_VERSION ||
    Boolean(result.media.atlasVersions) ||
    Boolean(result.media.loadoutVersionIds);
  return { environmentVersion, kitVersion, usesStoredVersions };
}

export function formatOutcomeLine(outcome: BattleOutcome): string {
  if (outcome.reason === 'action_limit_tiebreak') {
    return outcome.winnerByTiebreak
      ? `Tiebreak → ${outcome.winnerByTiebreak}`
      : 'Action-limit draw';
  }
  return outcome.winner ? `Winner: ${outcome.winner}` : 'No winner';
}
