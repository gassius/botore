import type { LoadoutSavePort } from './LoadoutSavePort';
import type {
  FetchCurrentLoadoutResult,
  GarageLoadout,
  OwnedCharacterResult,
  SaveLoadoutInput,
  SaveLoadoutResult,
} from './loadoutTypes';
import {
  DEFAULT_CONFIRMED_LOADOUT,
  PROOF_ATLAS_VERSION,
  PROOF_CHARACTER_ID,
  PROOF_DISPLAY_NAME,
} from './proofCatalogue';

/**
 * DEV save adapter: simulates server confirmation and a controllable failure
 * path for scaffolding (set forceFailNext / paint-force-fail).
 * The seeded `player-hero` fixture stays inside this adapter only.
 */
export class DevLoadoutSaveAdapter implements LoadoutSavePort {
  readonly kind = 'dev' as const;
  private store = new Map<
    string,
    { loadout: GarageLoadout; versionId: string; atlasVersion: string }
  >([
    [
      PROOF_CHARACTER_ID,
      {
        loadout: DEFAULT_CONFIRMED_LOADOUT,
        versionId: '00000000-0000-4000-8000-dev000000001',
        atlasVersion: PROOF_ATLAS_VERSION,
      },
    ],
  ]);
  forceFailNext = false;
  /** Optional second owned character for dual-account tests. */
  extraOwned: { characterId: string; displayName: string; loadout: GarageLoadout } | null = null;

  async resolveOwnedCharacter(accessToken: string): Promise<OwnedCharacterResult> {
    if (!accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    // DEV maps any signed-in session to the seeded proof character unless a
    // second fixture is registered for multi-owner tests.
    if (this.extraOwned && accessToken.includes(this.extraOwned.characterId)) {
      return {
        ok: true,
        character: {
          characterId: this.extraOwned.characterId,
          displayName: this.extraOwned.displayName,
        },
      };
    }
    return {
      ok: true,
      character: { characterId: PROOF_CHARACTER_ID, displayName: PROOF_DISPLAY_NAME },
    };
  }

  async fetchCurrent(input: {
    characterId: string;
    accessToken: string;
  }): Promise<FetchCurrentLoadoutResult> {
    if (!input.accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    const row = this.store.get(input.characterId);
    if (!row) {
      if (this.extraOwned && input.characterId === this.extraOwned.characterId) {
        const seeded = {
          loadout: this.extraOwned.loadout,
          versionId: '00000000-0000-4000-8000-dev000000002',
          atlasVersion: PROOF_ATLAS_VERSION,
        };
        this.store.set(input.characterId, seeded);
        return {
          ok: true,
          snapshot: {
            loadoutVersionId: seeded.versionId,
            atlasVersion: seeded.atlasVersion,
            loadout: seeded.loadout,
          },
        };
      }
      return {
        ok: false,
        code: 'unknown_character',
        message: `DEV scaffold has no loadout for ${input.characterId}`,
      };
    }
    return {
      ok: true,
      snapshot: {
        loadoutVersionId: row.versionId,
        atlasVersion: row.atlasVersion,
        loadout: row.loadout,
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
    const versionId = `00000000-0000-4000-8000-dev${String(Date.now()).slice(-9)}`;
    this.store.set(input.characterId, {
      loadout: input.loadout,
      versionId,
      atlasVersion: input.atlasVersion,
    });
    return {
      ok: true,
      loadoutVersionId: versionId,
      atlasVersion: input.atlasVersion,
      loadout: input.loadout,
    };
  }
}
