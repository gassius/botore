/**
 * E4 multi-bot RPC contract (ClickUp 1amjtrezebb).
 *
 * SECURITY DEFINER RPCs — no table GRANTs on characters / player_bot_config.
 * Cap comes from player_bot_config (default 3); never hard-code in UI copy.
 */

export const LIST_OWNED_CHARACTERS_RPC = 'list_owned_characters' as const;
export const CREATE_OWNED_CHARACTER_RPC = 'create_owned_character' as const;
export const SELECT_ACTIVE_CHARACTER_RPC = 'select_active_character' as const;
export const SUGGEST_BOT_NAME_RPC = 'suggest_bot_name' as const;

/** Default cap when offline / before hydrate — UI must prefer server `cap`. */
export const DEFAULT_PLAYER_BOT_CAP = 3;

export type OwnedBotRpcRow = {
  readonly characterId: string;
  readonly displayName: string;
  readonly wins: number;
  readonly losses: number;
  readonly paint: string | null;
  readonly weapon: string | null;
  readonly atlasVersion: string | null;
  readonly isActive: boolean;
};

export type ListOwnedCharactersRpcOk = {
  readonly ok: true;
  readonly bots: readonly OwnedBotRpcRow[];
  readonly cap: number;
  readonly ownedCount: number;
  readonly activeCharacterId: string | null;
};

export type SuggestBotNameRpcOk = {
  readonly ok: true;
  readonly displayName: string;
};

export type CreateOwnedCharacterRpcOk = {
  readonly ok: true;
  readonly characterId: string;
  readonly displayName: string;
  readonly loadoutVersionId?: string;
  readonly cap?: number;
  readonly ownedCount?: number;
};

export type SelectActiveCharacterRpcOk = {
  readonly ok: true;
  readonly characterId: string;
  readonly displayName: string;
};

export type MultiBotRpcFail = {
  readonly ok: false;
  readonly code?: string;
  readonly message?: string;
};
