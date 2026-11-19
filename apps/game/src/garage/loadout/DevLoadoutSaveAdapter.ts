import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { DEFAULT_PLAYER_BOT_CAP } from '../../supabase/multiBotRpcs';
import type { LoadoutSavePort } from './LoadoutSavePort';
import type {
  CreateOwnedBotInput,
  CreateOwnedBotResult,
  FetchCurrentLoadoutResult,
  GarageLoadout,
  ListOwnedBotsResult,
  OwnedBotSummary,
  OwnedCharacterResult,
  RenameCharacterInput,
  RenameCharacterResult,
  SaveLoadoutInput,
  SaveLoadoutResult,
  SelectActiveBotResult,
  SuggestBotNameResult,
} from './loadoutTypes';
import {
  DEFAULT_CONFIRMED_LOADOUT,
  PROOF_ATLAS_VERSION,
  PROOF_CHARACTER_ID,
  PROOF_DISPLAY_NAME,
  PROOF_PAINTS,
  PROOF_SHAPES,
  PROOF_WEAPONS,
  STOCK_SHAPE_LOADOUT,
} from './proofCatalogue';
import { SHAPE_SLOTS } from '../../assembler/shapes';

/**
 * Pre-A6 starter ownership — mirrors a returning player before ensure grants.
 * Stock A4 shapes count as starter: every pre-A4 loadout already wears them.
 */
const DEV_STARTER_OWNED_PARTS = [
  'chassis-basic',
  'paint-crimson',
  'weapon-sword',
  ...Object.values(STOCK_SHAPE_LOADOUT),
] as const;

const DEV_NAME_LEFT = ['Rust', 'Tin', 'Iron', 'Bolt', 'Oxide', 'Spark'] as const;
const DEV_NAME_RIGHT = ['Baron', 'Caesar', 'Pilot', 'Knight', 'Rex', 'Scout'] as const;

/**
 * DEV save adapter: simulates server confirmation and a controllable failure
 * path for scaffolding (set forceFailNext / paint-force-fail).
 * The seeded `player-hero` fixture stays inside this adapter only.
 *
 * Ownership mirrors 0038: starter parts only until hydrate/ensure grants the
 * full proof catalogue. `save` rejects unowned parts with `unowned_part`.
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
  /** Persisted display names (D7 rename remount survival). */
  private names = new Map<string, string>([[PROOF_CHARACTER_ID, PROOF_DISPLAY_NAME]]);
  private activeCharacterId = PROOF_CHARACTER_ID;
  private readonly ownedOrder: string[] = [PROOF_CHARACTER_ID];
  private ownedParts = new Set<string>(DEV_STARTER_OWNED_PARTS);
  private nameSuggestCursor = 0;
  forceFailNext = false;
  forceFailNextRename = false;
  /**
   * When false, resolveOwnedCharacter skips catalogue grants (pre-0038).
   * Default true so hydrate mirrors always-ensure.
   */
  ensureCatalogueOnResolve = true;
  /** Optional second owned character for dual-account tests. */
  extraOwned: { characterId: string; displayName: string; loadout: GarageLoadout } | null = null;

  /** Mirrors ensure_player_character A6 + A4 shape grants (0038 always-ensure, 0039). */
  ensureCatalogueGrants(): void {
    this.ownedParts.add('chassis-basic');
    for (const paint of PROOF_PAINTS) this.ownedParts.add(paint.partId);
    for (const weapon of PROOF_WEAPONS) this.ownedParts.add(weapon.partId);
    for (const slot of SHAPE_SLOTS) {
      for (const shape of PROOF_SHAPES[slot]) this.ownedParts.add(shape.partId);
    }
  }

  async resolveOwnedCharacter(accessToken: string): Promise<OwnedCharacterResult> {
    if (!accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    if (this.ensureCatalogueOnResolve) {
      this.ensureCatalogueGrants();
    }
    // DEV maps any signed-in session to the seeded proof character unless a
    // second fixture is registered for multi-owner tests.
    if (this.extraOwned && accessToken.includes(this.extraOwned.characterId)) {
      const id = this.extraOwned.characterId;
      return {
        ok: true,
        character: {
          characterId: id,
          displayName: this.names.get(id) ?? this.extraOwned.displayName,
        },
      };
    }
    return {
      ok: true,
      character: {
        characterId: this.activeCharacterId,
        displayName: this.names.get(this.activeCharacterId) ?? PROOF_DISPLAY_NAME,
      },
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
    // Hydrate may have already granted catalogue parts; Equip self-heal mirrors
    // save_bot_loadout calling ensure before ownership asserts (0038).
    if (this.ensureCatalogueOnResolve) {
      this.ensureCatalogueGrants();
    }
    const required = [
      input.loadout.chassis,
      input.loadout.paint,
      input.loadout.weapon,
      ...SHAPE_SLOTS.map((slot) => input.loadout[slot]),
    ].filter((partId): partId is string => typeof partId === 'string' && partId.length > 0);
    for (const partId of required) {
      if (!this.ownedParts.has(partId)) {
        return {
          ok: false,
          code: 'unowned_part',
          message: 'You do not own that part yet. Your equipped loadout is unchanged.',
        };
      }
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

  async renameCharacter(input: RenameCharacterInput): Promise<RenameCharacterResult> {
    if (!input.accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    if (this.forceFailNextRename) {
      this.forceFailNextRename = false;
      return {
        ok: false,
        code: 'dev_forced_failure',
        message: 'Could not rename. Your bot name is unchanged.',
      };
    }
    const next = playerFacingDisplayName(input.displayName.slice(0, 12));
    if (!next.trim()) {
      return {
        ok: false,
        code: 'invalid_display_name',
        message: 'Could not rename. Pick a different name.',
      };
    }
    this.names.set(this.activeCharacterId, next);
    if (this.extraOwned && this.activeCharacterId === this.extraOwned.characterId) {
      this.extraOwned = { ...this.extraOwned, displayName: next };
    }
    return { ok: true, characterId: this.activeCharacterId, displayName: next };
  }

  async listOwnedBots(accessToken: string): Promise<ListOwnedBotsResult> {
    if (!accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    const bots: OwnedBotSummary[] = this.ownedOrder.map((id) => {
      const row = this.store.get(id);
      const loadout = row?.loadout ?? DEFAULT_CONFIRMED_LOADOUT;
      return {
        characterId: id,
        displayName: this.names.get(id) ?? PROOF_DISPLAY_NAME,
        wins: id === PROOF_CHARACTER_ID ? 12 : 0,
        losses: id === PROOF_CHARACTER_ID ? 6 : 0,
        paint: loadout.paint,
        weapon: loadout.weapon,
        head: loadout.head,
        body: loadout.body,
        arms: loadout.arms,
        legs: loadout.legs,
        atlasVersion: row?.atlasVersion ?? PROOF_ATLAS_VERSION,
        isActive: id === this.activeCharacterId,
      };
    });
    return {
      ok: true,
      bots,
      cap: DEFAULT_PLAYER_BOT_CAP,
      ownedCount: bots.length,
      activeCharacterId: this.activeCharacterId,
    };
  }

  async suggestBotName(accessToken: string): Promise<SuggestBotNameResult> {
    if (!accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    for (let i = 0; i < 24; i += 1) {
      const left = DEV_NAME_LEFT[this.nameSuggestCursor % DEV_NAME_LEFT.length]!;
      const right =
        DEV_NAME_RIGHT[
          Math.floor(this.nameSuggestCursor / DEV_NAME_LEFT.length) % DEV_NAME_RIGHT.length
        ]!;
      this.nameSuggestCursor += 1;
      const displayName = `${left} ${right}`;
      if (displayName.length > 12) continue;
      const taken = [...this.names.values()].some(
        (n) => n.toLowerCase() === displayName.toLowerCase(),
      );
      if (!taken) return { ok: true, displayName };
    }
    return { ok: true, displayName: 'Tin Rex' };
  }

  async createOwnedBot(input: CreateOwnedBotInput): Promise<CreateOwnedBotResult> {
    if (!input.accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    const name = playerFacingDisplayName(input.displayName.trim().slice(0, 12));
    if (!name.trim()) {
      return { ok: false, code: 'invalid_display_name', message: 'Pick a name for your bot' };
    }
    if ([...this.names.values()].some((n) => n.toLowerCase() === name.toLowerCase())) {
      return { ok: false, code: 'name_taken', message: 'You already have a bot with that name' };
    }
    if (this.ownedOrder.length >= DEFAULT_PLAYER_BOT_CAP) {
      return { ok: false, code: 'bot_cap_reached', message: 'Your Ludus is full' };
    }
    const characterId = `player-dev-${this.ownedOrder.length + 1}`;
    const loadout: GarageLoadout = {
      ...DEFAULT_CONFIRMED_LOADOUT,
      paint: input.paint,
      weapon: input.weapon,
    };
    this.ensureCatalogueGrants();
    this.ownedParts.add(input.paint);
    this.ownedParts.add(input.weapon);
    this.store.set(characterId, {
      loadout,
      versionId: `00000000-0000-4000-8000-dev${String(this.ownedOrder.length + 1).padStart(9, '0')}`,
      atlasVersion: PROOF_ATLAS_VERSION,
    });
    this.names.set(characterId, name);
    this.ownedOrder.push(characterId);
    this.activeCharacterId = characterId;
    return {
      ok: true,
      characterId,
      displayName: name,
      cap: DEFAULT_PLAYER_BOT_CAP,
      ownedCount: this.ownedOrder.length,
    };
  }

  async selectActiveBot(input: {
    characterId: string;
    accessToken: string;
  }): Promise<SelectActiveBotResult> {
    if (!input.accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    if (!this.ownedOrder.includes(input.characterId)) {
      return { ok: false, code: 'not_owned', message: 'That bot is not yours' };
    }
    this.activeCharacterId = input.characterId;
    return {
      ok: true,
      characterId: input.characterId,
      displayName: this.names.get(input.characterId) ?? PROOF_DISPLAY_NAME,
    };
  }
}
