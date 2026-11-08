import type {
  FetchCurrentLoadoutResult,
  SaveLoadoutInput,
  SaveLoadoutResult,
} from './loadoutTypes';

/**
 * Server-confirmed loadout persistence.
 * Writes go through save_bot_loadout RPC only — never direct table inserts.
 */
export interface LoadoutSavePort {
  readonly kind: 'dev' | 'supabase';
  fetchCurrent(input: {
    characterId: string;
    accessToken: string;
  }): Promise<FetchCurrentLoadoutResult>;
  save(input: SaveLoadoutInput): Promise<SaveLoadoutResult>;
}
