import { DEFAULT_CONFIRMED_LOADOUT } from '../../garage/loadout/proofCatalogue';
import type { OpponentCandidatesPort } from './OpponentCandidatesPort';
import type { ListCandidatesResult, OpponentCandidate, PrepareEligibilityResult } from './types';

const DEV_UTC_DAY = () => new Date().toISOString().slice(0, 10);

const DEV_OPPONENTS: readonly OpponentCandidate[] = [
  {
    characterId: 'opp-sir-bot',
    displayName: 'Sir Bot',
    loadout: {
      ...DEFAULT_CONFIRMED_LOADOUT,
      paint: 'paint-cobalt',
      weapon: 'weapon-sword',
      soundTags: ['chassis.light', 'weapon.sword'],
    },
    loadoutVersionId: 'dev-opp-sir',
    atlasVersion: 'v1',
  },
  {
    characterId: 'opp-dex-bot',
    displayName: 'Dex Bot',
    loadout: {
      ...DEFAULT_CONFIRMED_LOADOUT,
      paint: 'paint-crimson',
      weapon: 'weapon-dagger',
      soundTags: ['chassis.light', 'weapon.dagger'],
    },
    loadoutVersionId: 'dev-opp-dex',
    atlasVersion: 'v1',
  },
  {
    characterId: 'opp-hp-bot',
    displayName: 'Tank Bot',
    loadout: {
      ...DEFAULT_CONFIRMED_LOADOUT,
      paint: 'paint-cobalt',
      weapon: 'weapon-axe',
      soundTags: ['chassis.light', 'weapon.axe'],
    },
    loadoutVersionId: 'dev-opp-hp',
    atlasVersion: 'v1',
  },
];

/**
 * DEV roster mirroring seed opponents (1000/1001). Labels itself DEV — not a
 * live ranking algorithm. Controllable empty / no-allowance / network failure.
 */
export class DevOpponentCandidatesAdapter implements OpponentCandidatesPort {
  readonly kind = 'dev' as const;
  forceNetworkError = false;
  forceEmpty = false;
  allowancesRemaining = 3;
  private readonly byId = new Map(DEV_OPPONENTS.map((o) => [o.characterId, o]));

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
    const utcDay = DEV_UTC_DAY();
    if (this.forceEmpty) {
      return {
        ok: true,
        candidates: [],
        allowancesRemaining: this.allowancesRemaining,
        utcDay,
      };
    }
    return {
      ok: true,
      candidates: [...DEV_OPPONENTS],
      allowancesRemaining: this.allowancesRemaining,
      utcDay,
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
    const utcDay = DEV_UTC_DAY();
    if (this.allowancesRemaining < 1) {
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
        allowancesRemaining: this.allowancesRemaining,
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
      allowancesRemaining: this.allowancesRemaining,
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
