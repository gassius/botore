import {
  PLAYABLE_MISCONFIGURED_CODE,
  PLAYABLE_MISCONFIGURED_DETAIL,
} from '../../runtime/devScaffoldPolicy';
import type { LoadoutSavePort } from './LoadoutSavePort';
import type {
  FetchCurrentLoadoutResult,
  OwnedCharacterResult,
  SaveLoadoutInput,
  SaveLoadoutResult,
} from './loadoutTypes';

/** Fail-closed loadout port — no DEV inventory / save scaffold. */
export class UnavailableLoadoutSaveAdapter implements LoadoutSavePort {
  readonly kind = 'unavailable' as const;

  async resolveOwnedCharacter(_accessToken: string): Promise<OwnedCharacterResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }

  async fetchCurrent(_input: {
    characterId: string;
    accessToken: string;
  }): Promise<FetchCurrentLoadoutResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }

  async save(_input: SaveLoadoutInput): Promise<SaveLoadoutResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }
}
