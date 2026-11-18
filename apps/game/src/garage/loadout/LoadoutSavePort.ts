import type {
  FetchCurrentLoadoutResult,
  OwnedCharacterResult,
  RenameCharacterInput,
  RenameCharacterResult,
  SaveLoadoutInput,
  SaveLoadoutResult,
} from './loadoutTypes';

/**
 * Server-confirmed loadout + nameplate persistence.
 * Writes go through save_bot_loadout / rename_owned_character RPCs only —
 * never direct table inserts. Character ids come from the authenticated
 * ownership boundary, not fixtures.
 */
export interface LoadoutSavePort {
  readonly kind: 'dev' | 'supabase' | 'unavailable';
  /** Resolve the caller's owned player character (B RPC / DEV fixture). */
  resolveOwnedCharacter(accessToken: string): Promise<OwnedCharacterResult>;
  fetchCurrent(input: {
    characterId: string;
    accessToken: string;
  }): Promise<FetchCurrentLoadoutResult>;
  save(input: SaveLoadoutInput): Promise<SaveLoadoutResult>;
  /** D7 nameplate — persist display_name via rename_owned_character. */
  renameCharacter(input: RenameCharacterInput): Promise<RenameCharacterResult>;
}
