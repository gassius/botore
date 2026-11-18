import {
  PLAYABLE_MISCONFIGURED_CODE,
  PLAYABLE_MISCONFIGURED_DETAIL,
} from '../../runtime/devScaffoldPolicy';
import type { LoadoutSavePort } from './LoadoutSavePort';
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

  async renameCharacter(_input: RenameCharacterInput): Promise<RenameCharacterResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }

  async listOwnedBots(_accessToken: string): Promise<ListOwnedBotsResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }

  async suggestBotName(_accessToken: string): Promise<SuggestBotNameResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }

  async createOwnedBot(_input: CreateOwnedBotInput): Promise<CreateOwnedBotResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }

  async selectActiveBot(_input: {
    characterId: string;
    accessToken: string;
  }): Promise<SelectActiveBotResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }
}
