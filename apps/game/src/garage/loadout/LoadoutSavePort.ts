import type {
  FetchCurrentLoadoutResult,
  OwnedCharacterResult,
  SaveLoadoutInput,
  SaveLoadoutResult,
} from './loadoutTypes';

/**
 * Server-confirmed loadout persistence.
 * Writes go through save_bot_loadout RPC only — never direct table inserts.
 * Character ids come from the authenticated ownership boundary, not fixtures.
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
}
