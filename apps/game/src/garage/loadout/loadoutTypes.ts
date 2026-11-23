/**
 * Client loadout shape aligned with F1 / save_bot_loadout jsonb and F7
 * AssemblerLoadoutInput (required fields for confirmed saves).
 * A4 shapes (head/body/arms/legs) are catalogue ids; pre-A4 rows read as stock.
 */
export type GarageLoadout = {
  readonly chassis: string;
  readonly paint: string;
  readonly weapon: string;
  readonly shield: string | null;
  readonly drone: string | null;
  readonly decals: readonly string[];
  readonly soundTags: readonly string[];
  readonly head: string;
  readonly body: string;
  readonly arms: string;
  readonly legs: string;
};

export type ConfirmedLoadoutSnapshot = {
  readonly loadoutVersionId: string | null;
  readonly atlasVersion: string;
  readonly loadout: GarageLoadout;
};

export type OwnedCharacter = {
  readonly characterId: string;
  readonly displayName: string;
  /** Lanista / Botore display name from profiles (D11 Confirm name plates). */
  readonly botoreName?: string | null;
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

export type RenameCharacterInput = {
  readonly displayName: string;
  readonly accessToken: string;
};

export type RenameCharacterResult =
  | { readonly ok: true; readonly characterId: string; readonly displayName: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

export type FetchCurrentLoadoutResult =
  | { readonly ok: true; readonly snapshot: ConfirmedLoadoutSnapshot }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** E4 owned-bot row for Ludus carousel (server list_owned_characters). */
export type OwnedBotSummary = {
  readonly characterId: string;
  readonly displayName: string;
  readonly wins: number;
  readonly losses: number;
  readonly paint: string | null;
  readonly weapon: string | null;
  /** A4 shape slots — null when omitted (pre-A4 / stock). */
  readonly head: string | null;
  readonly body: string | null;
  readonly arms: string | null;
  readonly legs: string | null;
  readonly atlasVersion: string | null;
  readonly isActive: boolean;
};

export type ListOwnedBotsResult =
  | {
      readonly ok: true;
      readonly bots: readonly OwnedBotSummary[];
      readonly cap: number;
      readonly ownedCount: number;
      readonly activeCharacterId: string | null;
    }
  | { readonly ok: false; readonly code: string; readonly message: string };

export type SuggestBotNameResult =
  | { readonly ok: true; readonly displayName: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

export type CreateOwnedBotInput = {
  readonly displayName: string;
  readonly paint: string;
  readonly weapon: string;
  readonly accessToken: string;
};

export type CreateOwnedBotResult =
  | {
      readonly ok: true;
      readonly characterId: string;
      readonly displayName: string;
      readonly cap?: number;
      readonly ownedCount?: number;
    }
  | { readonly ok: false; readonly code: string; readonly message: string };

export type SelectActiveBotResult =
  | { readonly ok: true; readonly characterId: string; readonly displayName: string }
  | { readonly ok: false; readonly code: string; readonly message: string };
