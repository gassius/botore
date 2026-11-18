import type { GarageLoadout } from '../../garage/loadout/loadoutTypes';

/** System opponent from list_opponent_roster + current_bot_loadouts. */
export type OpponentCandidate = {
  readonly characterId: string;
  readonly displayName: string;
  readonly loadout: GarageLoadout;
  readonly loadoutVersionId: string | null;
  readonly atlasVersion: string;
  /** Botore handle when a sanctioned read path supplies it; omit rather than invent. */
  readonly botoreName?: string | null;
  /** W–L when a sanctioned read path supplies it; omit rather than invent. */
  readonly wins?: number | null;
  readonly losses?: number | null;
};

export type ListCandidatesResult =
  | {
      readonly ok: true;
      readonly candidates: readonly OpponentCandidate[];
      readonly allowancesRemaining: number;
      readonly utcDay: string;
    }
  | {
      readonly ok: false;
      readonly code: 'network_error' | 'unauthenticated' | 'forbidden' | string;
      readonly message: string;
      readonly allowancesRemaining?: number;
      readonly utcDay?: string;
    };

/** Eligibility from prepare_fight_context — no allowance consume; no invented costs. */
export type PrepareEligibilityResult =
  | {
      readonly ok: true;
      readonly code: 'eligible';
      readonly allowancesRemaining: number;
      readonly utcDay: string;
      readonly rulesVersion: string;
      readonly attackerName: string;
      readonly defenderName: string;
      readonly defenderWeaponKind: 'sword' | 'axe' | 'dagger' | string;
      readonly defenderLoadoutVersionId: string | null;
      readonly defenderAtlasVersion: string;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly allowancesRemaining?: number;
      readonly utcDay?: string;
    };
