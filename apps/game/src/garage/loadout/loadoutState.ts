import type { GarageLoadout } from './loadoutTypes';
import { PROOF_ATLAS_VERSION } from './proofCatalogue';

export type HydrationStatus = 'ready' | 'unavailable';

export type LoadoutPreviewState = {
  readonly hydration: HydrationStatus;
  readonly accountId: string | null;
  readonly characterId: string | null;
  readonly displayName: string | null;
  readonly confirmedLoadout: GarageLoadout | null;
  readonly pendingLoadout: GarageLoadout | null;
  readonly confirmedVersionId: string | null;
  readonly atlasVersion: string;
  readonly dirty: boolean;
  readonly saving: boolean;
  /** Loadout snapshot sent with the in-flight save (guards late responses). */
  readonly saveRequestLoadout: GarageLoadout | null;
  readonly lastError: string | null;
  /** Machine code for lastError (network_error / unauthenticated / …). */
  readonly lastErrorCode: string | null;
};

export function loadoutsEqual(a: GarageLoadout, b: GarageLoadout): boolean {
  return (
    a.chassis === b.chassis &&
    a.paint === b.paint &&
    a.weapon === b.weapon &&
    a.shield === b.shield &&
    a.drone === b.drone &&
    a.decals.length === b.decals.length &&
    a.decals.every((id: string, i: number) => id === b.decals[i]) &&
    a.soundTags.length === b.soundTags.length &&
    a.soundTags.every((tag: string, i: number) => tag === b.soundTags[i])
  );
}

export function createUnavailableLoadoutState(input?: {
  message?: string;
  code?: string | null;
  atlasVersion?: string;
}): LoadoutPreviewState {
  return {
    hydration: 'unavailable',
    accountId: null,
    characterId: null,
    displayName: null,
    confirmedLoadout: null,
    pendingLoadout: null,
    confirmedVersionId: null,
    atlasVersion: input?.atlasVersion ?? PROOF_ATLAS_VERSION,
    dirty: false,
    saving: false,
    saveRequestLoadout: null,
    lastError: input?.message ?? null,
    lastErrorCode: input?.code ?? null,
  };
}

export function createLoadoutPreviewState(input: {
  accountId: string;
  characterId: string;
  displayName: string;
  confirmedLoadout: GarageLoadout;
  confirmedVersionId?: string | null;
  atlasVersion?: string;
}): LoadoutPreviewState {
  return {
    hydration: 'ready',
    accountId: input.accountId,
    characterId: input.characterId,
    displayName: input.displayName,
    confirmedLoadout: input.confirmedLoadout,
    pendingLoadout: input.confirmedLoadout,
    confirmedVersionId: input.confirmedVersionId ?? null,
    atlasVersion: input.atlasVersion ?? PROOF_ATLAS_VERSION,
    dirty: false,
    saving: false,
    saveRequestLoadout: null,
    lastError: null,
    lastErrorCode: null,
  };
}

/**
 * Hydration failed: never invent a confirmed loadout.
 * Preserve a previously confirmed snapshot only for the same account+character;
 * still mark unavailable so save/continue stay blocked until a successful hydrate.
 */
export function markHydrationUnavailable(
  previous: LoadoutPreviewState,
  input: {
    accountId: string | null;
    characterId: string | null;
    displayName?: string | null;
    message: string;
    code?: string | null;
  },
): LoadoutPreviewState {
  const sameOwner =
    previous.hydration === 'ready' &&
    previous.confirmedLoadout !== null &&
    input.accountId !== null &&
    input.characterId !== null &&
    previous.accountId === input.accountId &&
    previous.characterId === input.characterId;

  if (sameOwner && previous.confirmedLoadout) {
    return {
      ...previous,
      hydration: 'unavailable',
      displayName: input.displayName ?? previous.displayName,
      pendingLoadout: previous.confirmedLoadout,
      dirty: false,
      saving: false,
      saveRequestLoadout: null,
      lastError: input.message,
      lastErrorCode: input.code ?? null,
    };
  }

  return {
    hydration: 'unavailable',
    accountId: input.accountId,
    characterId: input.characterId,
    displayName: input.displayName ?? null,
    confirmedLoadout: null,
    pendingLoadout: null,
    confirmedVersionId: null,
    atlasVersion: previous.atlasVersion,
    dirty: false,
    saving: false,
    saveRequestLoadout: null,
    lastError: input.message,
    lastErrorCode: input.code ?? null,
  };
}

export function setPendingLoadout(
  state: LoadoutPreviewState,
  pendingLoadout: GarageLoadout,
): LoadoutPreviewState {
  if (state.hydration !== 'ready' || state.confirmedLoadout === null || state.saving) {
    return state;
  }
  return {
    ...state,
    pendingLoadout,
    dirty: !loadoutsEqual(state.confirmedLoadout, pendingLoadout),
    lastError: null,
    lastErrorCode: null,
  };
}

/** Discard / back restores last confirmed; clears error. */
export function discardPending(state: LoadoutPreviewState): LoadoutPreviewState {
  if (state.confirmedLoadout === null || state.saving) return state;
  return {
    ...state,
    pendingLoadout: state.confirmedLoadout,
    dirty: false,
    saving: false,
    saveRequestLoadout: null,
    lastError: null,
    lastErrorCode: null,
  };
}

export function beginSave(state: LoadoutPreviewState): LoadoutPreviewState {
  if (
    state.hydration !== 'ready' ||
    state.pendingLoadout === null ||
    state.confirmedLoadout === null ||
    !state.dirty ||
    state.saving
  ) {
    return state;
  }
  return {
    ...state,
    saving: true,
    saveRequestLoadout: state.pendingLoadout,
    lastError: null,
    lastErrorCode: null,
  };
}

/**
 * Failed save keeps last confirmed configuration; pending preview intentionally
 * remains so the player can retry or discard.
 */
export function failSave(
  state: LoadoutPreviewState,
  message: string,
  code?: string | null,
): LoadoutPreviewState {
  return {
    ...state,
    saving: false,
    saveRequestLoadout: null,
    lastError: message,
    lastErrorCode: code ?? null,
    // confirmedLoadout unchanged by design
  };
}

/**
 * Apply a successful save. If the player somehow changed pending while the
 * request was in flight, rebase: promote the saved snapshot to confirmed and
 * keep newer pending edits as dirty instead of silently overwriting them.
 */
export function confirmSave(
  state: LoadoutPreviewState,
  input: {
    loadout: GarageLoadout;
    loadoutVersionId: string;
    atlasVersion: string;
  },
): LoadoutPreviewState {
  const pending = state.pendingLoadout;
  const request = state.saveRequestLoadout ?? input.loadout;
  const pendingMoved =
    pending !== null && !loadoutsEqual(pending, request) && !loadoutsEqual(pending, input.loadout);

  if (pendingMoved && pending) {
    return {
      ...state,
      hydration: 'ready',
      confirmedLoadout: input.loadout,
      pendingLoadout: pending,
      confirmedVersionId: input.loadoutVersionId,
      atlasVersion: input.atlasVersion,
      dirty: !loadoutsEqual(input.loadout, pending),
      saving: false,
      saveRequestLoadout: null,
      lastError: null,
      lastErrorCode: null,
    };
  }

  return {
    ...state,
    hydration: 'ready',
    confirmedLoadout: input.loadout,
    pendingLoadout: input.loadout,
    confirmedVersionId: input.loadoutVersionId,
    atlasVersion: input.atlasVersion,
    dirty: false,
    saving: false,
    saveRequestLoadout: null,
    lastError: null,
    lastErrorCode: null,
  };
}
