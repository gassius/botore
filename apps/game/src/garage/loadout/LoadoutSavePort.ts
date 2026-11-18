import type {
  CreateOwnedBotInput,
  CreateOwnedBotResult,
  FetchCurrentLoadoutResult,
  ListOwnedBotsResult,
  OwnedCharacterResult,
  RenameCharacterInput,
  RenameCharacterResult,
  SaveLoadoutInput,
  SaveLoadoutResult,
  SelectActiveBotResult,
  SuggestBotNameResult,
} from './loadoutTypes';

/**
 * Server-confirmed loadout + nameplate + E4 multi-bot persistence.
 * Writes go through save_bot_loadout / rename_owned_character /
 * create_owned_character / select_active_character RPCs only — never direct
 * table inserts. Character ids come from the authenticated ownership boundary.
 */
export interface LoadoutSavePort {
  readonly kind: 'dev' | 'supabase' | 'unavailable';
  /** Resolve the caller's active owned player character (B/E4 RPC / DEV fixture). */
  resolveOwnedCharacter(accessToken: string): Promise<OwnedCharacterResult>;
  fetchCurrent(input: {
    characterId: string;
    accessToken: string;
  }): Promise<FetchCurrentLoadoutResult>;
  save(input: SaveLoadoutInput): Promise<SaveLoadoutResult>;
  /** D7 nameplate — persist display_name via rename_owned_character. */
  renameCharacter(input: RenameCharacterInput): Promise<RenameCharacterResult>;
  /** E4 — list owned bots + cap + active. */
  listOwnedBots(accessToken: string): Promise<ListOwnedBotsResult>;
  /** E4 — server random fitting name. */
  suggestBotName(accessToken: string): Promise<SuggestBotNameResult>;
  /** E4 — create under cap; becomes active. */
  createOwnedBot(input: CreateOwnedBotInput): Promise<CreateOwnedBotResult>;
  /** E4 — persist active bot selection. */
  selectActiveBot(input: {
    characterId: string;
    accessToken: string;
  }): Promise<SelectActiveBotResult>;
}
