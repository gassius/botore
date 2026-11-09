/** Immutable bot build snapshot carried with a fight for historical playback. */
export type SealedFightBuildSnapshot = {
  readonly chassis: string;
  readonly paint: string;
  readonly weapon: string;
  readonly shield?: string | null;
  readonly drone?: string | null;
  readonly decals?: readonly string[];
  readonly soundTags?: readonly string[];
  readonly loadoutVersionId?: string | null;
  readonly atlasVersion?: string;
};

/** Successful combat-v1 response (persisted or repeated via F3 idempotency). */
export type FightSuccess = {
  readonly battleId: string;
  readonly status: 'completed';
  readonly rulesVersion: string;
  readonly seed: string;
  readonly outcome: {
    readonly winner: string | null;
    readonly reason: 'defeat' | 'action_limit_tiebreak' | string;
  };
  readonly replay: unknown;
  readonly replayChecksum: string;
  readonly xpAwarded: number;
  readonly allowancesRemaining: number;
  readonly utcDay: string;
  readonly repeated: boolean;
  readonly persistence: 'persisted' | 'repeated' | string;
  readonly loadoutVersionIds: {
    readonly attacker: string | null;
    readonly defender: string | null;
  };
  readonly atlasVersions: {
    readonly attacker: string;
    readonly defender: string;
  };
  /**
   * Client-attached sealed builds for F10 historical playback.
   * Optional on the wire; FightSession attaches them from confirmed + opponent loadouts.
   */
  readonly sealedBuilds?: {
    readonly attacker: SealedFightBuildSnapshot;
    readonly defender: SealedFightBuildSnapshot;
  };
  readonly opponentId: string;
  readonly idempotencyKey: string;
};

export type FightRequestResult =
  | { readonly ok: true; readonly fight: FightSuccess }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly allowancesRemaining?: number;
      readonly httpStatus?: number;
    };

export type FightRequestInput = {
  readonly accessToken: string;
  readonly opponentId: string;
  /** Stable key for this user intent — reused on double-tap / retry. */
  readonly idempotencyKey: string;
};
