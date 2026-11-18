import {
  DEFAULT_CONFIRMED_LOADOUT,
  PROOF_ATLAS_VERSION,
} from '../../garage/loadout/proofCatalogue';
import { DevFightBackendState, getSharedDevFightBackend } from '../dev/DevFightBackendState';
import type { OpponentCandidatesPort } from './OpponentCandidatesPort';
import type { ListCandidatesResult, OpponentCandidate, PrepareEligibilityResult } from './types';

/**
 * A5 roster names + A6 D8 lanista / record pairings.
 * Loadouts match A6_OPPONENT_BAKES so combat seed === Opponents/ToTT presentation.
 */
const DEV_OPPONENTS: readonly OpponentCandidate[] = [
  {
    characterId: 'opp-dex-bot',
    displayName: 'Can Hook',
    botoreName: 'Magistra Volta',
    wins: 19,
    losses: 2,
    loadout: {
      ...DEFAULT_CONFIRMED_LOADOUT,
      paint: 'paint-primer',
      weapon: 'weapon-spear',
      soundTags: ['chassis.light', 'weapon.spear'],
    },
    loadoutVersionId: 'dev-opp-dex',
    atlasVersion: PROOF_ATLAS_VERSION,
  },
  {
    characterId: 'opp-hp-bot',
    displayName: 'Cobalt Brute',
    botoreName: 'Doctore Ferro',
    wins: 15,
    losses: 5,
    loadout: {
      ...DEFAULT_CONFIRMED_LOADOUT,
      paint: 'paint-navy',
      weapon: 'weapon-mace',
      soundTags: ['chassis.light', 'weapon.mace'],
    },
    loadoutVersionId: 'dev-opp-hp',
    atlasVersion: PROOF_ATLAS_VERSION,
  },
  {
    characterId: 'opp-sir-bot',
    displayName: 'Slab Mick',
    botoreName: 'Tito Rivet',
    wins: 13,
    losses: 6,
    loadout: {
      ...DEFAULT_CONFIRMED_LOADOUT,
      paint: 'paint-cinder',
      weapon: 'weapon-mace',
      soundTags: ['chassis.light', 'weapon.mace'],
    },
    loadoutVersionId: 'dev-opp-sir',
    atlasVersion: PROOF_ATLAS_VERSION,
  },
];

/**
 * DEV roster mirroring seed opponents (1000/1001). Labels itself DEV — not a
 * live ranking algorithm. Controllable empty / no-allowance / network failure.
 * Allowance depth comes from shared DevFightBackendState.
 */
export class DevOpponentCandidatesAdapter implements OpponentCandidatesPort {
  readonly kind = 'dev' as const;
  forceNetworkError = false;
  forceEmpty = false;
  private readonly byId = new Map(DEV_OPPONENTS.map((o) => [o.characterId, o]));

  constructor(readonly backend: DevFightBackendState = getSharedDevFightBackend()) {}

  get allowancesRemaining(): number {
    return this.backend.allowancesRemaining;
  }

  set allowancesRemaining(value: number) {
    this.backend.allowancesRemaining = value;
  }

  async listCandidates(input: {
    accessToken: string;
    accountId: string;
  }): Promise<ListCandidatesResult> {
    if (!input.accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    if (this.forceNetworkError) {
      return { ok: false, code: 'network_error', message: 'DEV network failure (candidates)' };
    }
    const quota = this.backend.quota();
    if (this.forceEmpty) {
      return {
        ok: true,
        candidates: [],
        allowancesRemaining: quota.allowancesRemaining,
        utcDay: quota.utcDay,
        quota,
      };
    }
    return {
      ok: true,
      candidates: [...DEV_OPPONENTS],
      allowancesRemaining: quota.allowancesRemaining,
      utcDay: quota.utcDay,
      quota,
    };
  }

  async prepareEligibility(input: {
    accessToken: string;
    accountId: string;
    opponentId: string;
  }): Promise<PrepareEligibilityResult> {
    if (!input.accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    if (this.forceNetworkError) {
      return { ok: false, code: 'network_error', message: 'DEV network failure (eligibility)' };
    }
    const utcDay = this.backend.utcDay();
    if (this.backend.allowancesRemaining < 1) {
      return {
        ok: false,
        code: 'allowance_exhausted',
        message: 'daily fight allowance exhausted',
        allowancesRemaining: 0,
        utcDay,
      };
    }
    const defender = this.byId.get(input.opponentId);
    if (!defender) {
      return {
        ok: false,
        code: 'unknown_opponent',
        message: `unknown opponent: ${input.opponentId}`,
        allowancesRemaining: this.backend.allowancesRemaining,
        utcDay,
      };
    }
    const weapon = defender.loadout.weapon;
    const defenderWeaponKind =
      weapon === 'weapon-axe' || weapon === 'axe'
        ? 'axe'
        : weapon === 'weapon-dagger' || weapon === 'dagger'
          ? 'dagger'
          : 'sword';
    return {
      ok: true,
      code: 'eligible',
      allowancesRemaining: this.backend.allowancesRemaining,
      utcDay,
      rulesVersion: 'combat-v1',
      attackerName: 'Hero',
      defenderName: defender.displayName,
      defenderWeaponKind,
      defenderLoadoutVersionId: defender.loadoutVersionId,
      defenderAtlasVersion: defender.atlasVersion,
    };
  }
}
