import type { GarageLoadout } from './loadoutTypes';

export type LoadoutPreviewState = {
  readonly confirmedLoadout: GarageLoadout;
  readonly pendingLoadout: GarageLoadout;
  readonly confirmedVersionId: string | null;
  readonly atlasVersion: string;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly lastError: string | null;
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

export function createLoadoutPreviewState(input: {
  confirmedLoadout: GarageLoadout;
  confirmedVersionId?: string | null;
  atlasVersion?: string;
}): LoadoutPreviewState {
  return {
    confirmedLoadout: input.confirmedLoadout,
    pendingLoadout: input.confirmedLoadout,
    confirmedVersionId: input.confirmedVersionId ?? null,
    atlasVersion: input.atlasVersion ?? 'v1',
    dirty: false,
    saving: false,
    lastError: null,
  };
}

export function setPendingLoadout(
  state: LoadoutPreviewState,
  pendingLoadout: GarageLoadout,
): LoadoutPreviewState {
  return {
    ...state,
    pendingLoadout,
    dirty: !loadoutsEqual(state.confirmedLoadout, pendingLoadout),
    lastError: null,
  };
}

/** Discard / back restores last confirmed; clears error. */
export function discardPending(state: LoadoutPreviewState): LoadoutPreviewState {
  return {
    ...state,
    pendingLoadout: state.confirmedLoadout,
    dirty: false,
    saving: false,
    lastError: null,
  };
}

export function beginSave(state: LoadoutPreviewState): LoadoutPreviewState {
  return { ...state, saving: true, lastError: null };
}

/**
 * Failed save keeps last confirmed configuration; pending preview intentionally
 * remains so the player can retry or discard.
 */
export function failSave(state: LoadoutPreviewState, message: string): LoadoutPreviewState {
  return {
    ...state,
    saving: false,
    lastError: message,
    // confirmedLoadout unchanged by design
  };
}

export function confirmSave(
  _state: LoadoutPreviewState,
  input: {
    loadout: GarageLoadout;
    loadoutVersionId: string;
    atlasVersion: string;
  },
): LoadoutPreviewState {
  return {
    confirmedLoadout: input.loadout,
    pendingLoadout: input.loadout,
    confirmedVersionId: input.loadoutVersionId,
    atlasVersion: input.atlasVersion,
    dirty: false,
    saving: false,
    lastError: null,
  };
}
