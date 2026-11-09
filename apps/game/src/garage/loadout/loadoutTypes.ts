/**
 * Client loadout shape aligned with F1 / save_bot_loadout jsonb and F7
 * AssemblerLoadoutInput (required fields for confirmed saves).
 */
export type GarageLoadout = {
  readonly chassis: string;
  readonly paint: string;
  readonly weapon: string;
  readonly shield: string | null;
  readonly drone: string | null;
  readonly decals: readonly string[];
  readonly soundTags: readonly string[];
};

export type ConfirmedLoadoutSnapshot = {
  readonly loadoutVersionId: string | null;
  readonly atlasVersion: string;
  readonly loadout: GarageLoadout;
};

export type OwnedCharacter = {
  readonly characterId: string;
  readonly displayName: string;
};

export type OwnedCharacterResult =
  | { readonly ok: true; readonly character: OwnedCharacter }
  | { readonly ok: false; readonly code: string; readonly message: string };

export type SaveLoadoutInput = {
  readonly characterId: string;
  readonly loadout: GarageLoadout;
  readonly atlasVersion: string;
  readonly accessToken: string;
};

export type SaveLoadoutResult =
  | {
      readonly ok: true;
      readonly loadoutVersionId: string;
      readonly atlasVersion: string;
      readonly loadout: GarageLoadout;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    };

export type FetchCurrentLoadoutResult =
  | { readonly ok: true; readonly snapshot: ConfirmedLoadoutSnapshot }
  | { readonly ok: false; readonly code: string; readonly message: string };
