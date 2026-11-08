import type { LoadoutSavePort } from './LoadoutSavePort';
import type {
  FetchCurrentLoadoutResult,
  GarageLoadout,
  SaveLoadoutInput,
  SaveLoadoutResult,
} from './loadoutTypes';
import {
  DEFAULT_CONFIRMED_LOADOUT,
  PROOF_ATLAS_VERSION,
  PROOF_CHARACTER_ID,
} from './proofCatalogue';

/**
 * DEV save adapter: simulates server confirmation and a controllable failure
 * path for scaffolding (set forceFailNext / paint-force-fail).
 */
export class DevLoadoutSaveAdapter implements LoadoutSavePort {
  readonly kind = 'dev' as const;
  private confirmed: GarageLoadout = DEFAULT_CONFIRMED_LOADOUT;
  private versionId = '00000000-0000-4000-8000-dev000000001';
  private atlasVersion = PROOF_ATLAS_VERSION;
  forceFailNext = false;

  async fetchCurrent(input: {
    characterId: string;
    accessToken: string;
  }): Promise<FetchCurrentLoadoutResult> {
    if (!input.accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    if (input.characterId !== PROOF_CHARACTER_ID) {
      return {
        ok: false,
        code: 'unknown_character',
        message: `DEV scaffold only knows ${PROOF_CHARACTER_ID}`,
      };
    }
    return {
      ok: true,
      snapshot: {
        loadoutVersionId: this.versionId,
        atlasVersion: this.atlasVersion,
        loadout: this.confirmed,
      },
    };
  }

  async save(input: SaveLoadoutInput): Promise<SaveLoadoutResult> {
    if (!input.accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    if (this.forceFailNext || input.loadout.paint === 'paint-force-fail') {
      this.forceFailNext = false;
      return {
        ok: false,
        code: 'dev_forced_failure',
        message: 'Could not save changes. Your equipped loadout is unchanged.',
      };
    }
    this.confirmed = input.loadout;
    this.atlasVersion = input.atlasVersion;
    this.versionId = `00000000-0000-4000-8000-dev${String(Date.now()).slice(-9)}`;
    return {
      ok: true,
      loadoutVersionId: this.versionId,
      atlasVersion: this.atlasVersion,
      loadout: this.confirmed,
    };
  }
}
