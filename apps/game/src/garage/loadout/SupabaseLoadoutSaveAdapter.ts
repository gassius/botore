import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { resolveTransportFailureCode } from '../../session-failure';
import {
  OWNED_CHARACTER_RPC,
  type ClientReadRpcFail,
  type OwnedCharacterRpcOk,
} from '../../supabase/clientReadRpcs';
import {
  CREATE_OWNED_CHARACTER_RPC,
  DEFAULT_PLAYER_BOT_CAP,
  LIST_OWNED_CHARACTERS_RPC,
  SELECT_ACTIVE_CHARACTER_RPC,
  SUGGEST_BOT_NAME_RPC,
  type CreateOwnedCharacterRpcOk,
  type ListOwnedCharactersRpcOk,
  type MultiBotRpcFail,
  type OwnedBotRpcRow,
  type SelectActiveCharacterRpcOk,
  type SuggestBotNameRpcOk,
} from '../../supabase/multiBotRpcs';
import type { SupabasePublicConfig } from '../auth/supabasePublicConfig';
import type { LoadoutSavePort } from './LoadoutSavePort';
import { loadoutSavePlayerMessage } from './loadoutSaveErrors';
import type {
  CreateOwnedBotInput,
  CreateOwnedBotResult,
  FetchCurrentLoadoutResult,
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
import { normalizeGarageLoadout } from './normalizeLoadout';

export const RENAME_OWNED_CHARACTER_RPC = 'rename_owned_character' as const;

type RpcErrorBody = {
  message?: string;
  code?: string;
  hint?: string;
  details?: string;
};

/**
 * Calls public.save_bot_loadout / rename_owned_character + B client-read RPCs
 * via PostgREST with the user JWT. No service-role key; RLS + SECURITY DEFINER
 * authz remain authoritative. Does not SELECT characters / fight_allowances /
 * profiles tables.
 */
export class SupabaseLoadoutSaveAdapter implements LoadoutSavePort {
  readonly kind = 'supabase' as const;

  constructor(private readonly config: SupabasePublicConfig) {}

  async resolveOwnedCharacter(accessToken: string): Promise<OwnedCharacterResult> {
    try {
      const res = await fetch(`${this.config.url}/rest/v1/rpc/${OWNED_CHARACTER_RPC}`, {
        method: 'POST',
        headers: {
          ...this.headers(accessToken),
          Prefer: 'return=representation',
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as RpcErrorBody;
        return {
          ok: false,
          code: resolveTransportFailureCode({
            code: err.code ?? `http_${res.status}`,
            message: err.message,
            httpStatus: res.status,
          }),
          message: err.message ?? `Failed to resolve owned character (${res.status})`,
        };
      }
      const body = (await res.json()) as OwnedCharacterRpcOk | ClientReadRpcFail | null;
      if (!body || typeof body !== 'object') {
        return {
          ok: false,
          code: 'invalid_response',
          message: 'Owned-character RPC returned a malformed body.',
        };
      }
      if (body.ok !== true) {
        return {
          ok: false,
          code: body.code ?? 'no_owned_character',
          message: body.message ?? 'No player character is linked to this account.',
        };
      }
      const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
      if (!characterId) {
        return {
          ok: false,
          code: 'no_owned_character',
          message: 'No player character is linked to this account.',
        };
      }
      const rawName =
        typeof body.displayName === 'string' && body.displayName.trim().length > 0
          ? body.displayName.trim()
          : null;
      // C16/C17: never fall back to character UUID / player-hero as a label.
      const displayName = playerFacingDisplayName(rawName);
      return {
        ok: true,
        character: { characterId, displayName },
      };
    } catch (err) {
      return {
        ok: false,
        code: 'network_error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async fetchCurrent(input: {
    characterId: string;
    accessToken: string;
  }): Promise<FetchCurrentLoadoutResult> {
    try {
      const url = new URL(`${this.config.url}/rest/v1/current_bot_loadouts`);
      url.searchParams.set('character_id', `eq.${input.characterId}`);
      url.searchParams.set('select', 'loadout_version_id,character_id,loadout,atlas_version');
      const res = await fetch(url.toString(), {
        headers: this.headers(input.accessToken),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as RpcErrorBody;
        return {
          ok: false,
          code: resolveTransportFailureCode({
            code: err.code ?? `http_${res.status}`,
            message: err.message,
            httpStatus: res.status,
          }),
          message: err.message ?? `Failed to load confirmed loadout (${res.status})`,
        };
      }
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      const row = rows[0];
      if (!row) {
        return {
          ok: false,
          code: 'not_found',
          message: 'No confirmed loadout for this character yet.',
        };
      }
      return {
        ok: true,
        snapshot: {
          loadoutVersionId: String(row.loadout_version_id ?? ''),
          atlasVersion: String(row.atlas_version ?? 'v1'),
          loadout: normalizeGarageLoadout(row.loadout),
        },
      };
    } catch (err) {
      return {
        ok: false,
        code: 'network_error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async save(input: SaveLoadoutInput): Promise<SaveLoadoutResult> {
    try {
      const res = await fetch(`${this.config.url}/rest/v1/rpc/save_bot_loadout`, {
        method: 'POST',
        headers: {
          ...this.headers(input.accessToken),
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          p_character_id: input.characterId,
          p_loadout: {
            chassis: input.loadout.chassis,
            paint: input.loadout.paint,
            weapon: input.loadout.weapon,
            shield: input.loadout.shield,
            drone: input.loadout.drone,
            decals: input.loadout.decals,
            soundTags: input.loadout.soundTags,
          },
          p_atlas_version: input.atlasVersion,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as RpcErrorBody;
        const code = resolveTransportFailureCode({
          code: err.code ?? `http_${res.status}`,
          message: err.message ?? err.details,
          httpStatus: res.status,
        });
        return {
          ok: false,
          code,
          message: loadoutSavePlayerMessage({
            code,
            message: err.message ?? err.details,
          }),
        };
      }
      const versionId = await res.json();
      if (typeof versionId !== 'string' || versionId.length < 1) {
        return {
          ok: false,
          code: 'invalid_response',
          message: loadoutSavePlayerMessage({
            code: 'invalid_response',
            message: 'Save succeeded without a loadout version id.',
          }),
        };
      }
      return {
        ok: true,
        loadoutVersionId: versionId,
        atlasVersion: input.atlasVersion,
        loadout: input.loadout,
      };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        code: 'network_error',
        message: loadoutSavePlayerMessage({ code: 'network_error', message: raw }),
      };
    }
  }

  async renameCharacter(input: RenameCharacterInput): Promise<RenameCharacterResult> {
    try {
      const res = await fetch(`${this.config.url}/rest/v1/rpc/${RENAME_OWNED_CHARACTER_RPC}`, {
        method: 'POST',
        headers: {
          ...this.headers(input.accessToken),
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ p_display_name: input.displayName }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as RpcErrorBody;
        const code = resolveTransportFailureCode({
          code: err.code ?? `http_${res.status}`,
          message: err.message ?? err.details,
          httpStatus: res.status,
        });
        return {
          ok: false,
          code,
          message: loadoutSavePlayerMessage({
            code,
            message: err.message ?? err.details,
          }),
        };
      }
      const body = (await res.json()) as {
        ok?: boolean;
        characterId?: string;
        displayName?: string;
        code?: string;
        message?: string;
      } | null;
      if (!body || typeof body !== 'object' || body.ok !== true) {
        return {
          ok: false,
          code: body?.code ?? 'invalid_response',
          message:
            typeof body?.message === 'string' && body.message.trim().length > 0
              ? body.message
              : 'Could not rename. Your bot name is unchanged.',
        };
      }
      const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
      const rawName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      if (!characterId || !rawName) {
        return {
          ok: false,
          code: 'invalid_response',
          message: 'Could not rename. Your bot name is unchanged.',
        };
      }
      return {
        ok: true,
        characterId,
        displayName: playerFacingDisplayName(rawName),
      };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        code: 'network_error',
        message: loadoutSavePlayerMessage({ code: 'network_error', message: raw }),
      };
    }
  }

  async listOwnedBots(accessToken: string): Promise<ListOwnedBotsResult> {
    try {
      const res = await fetch(`${this.config.url}/rest/v1/rpc/${LIST_OWNED_CHARACTERS_RPC}`, {
        method: 'POST',
        headers: {
          ...this.headers(accessToken),
          Prefer: 'return=representation',
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as RpcErrorBody;
        return {
          ok: false,
          code: resolveTransportFailureCode({
            code: err.code ?? `http_${res.status}`,
            message: err.message,
            httpStatus: res.status,
          }),
          message: err.message ?? `Failed to list bots (${res.status})`,
        };
      }
      const body = (await res.json()) as ListOwnedCharactersRpcOk | MultiBotRpcFail | null;
      if (!body || typeof body !== 'object' || body.ok !== true) {
        return {
          ok: false,
          code: (body && 'code' in body && body.code) || 'invalid_response',
          message:
            (body && 'message' in body && body.message) || 'Could not load your bots.',
        };
      }
      const bots = Array.isArray(body.bots)
        ? body.bots.map((row) => normalizeOwnedBotRow(row)).filter((b): b is OwnedBotSummary => b != null)
        : [];
      const cap =
        typeof body.cap === 'number' && Number.isFinite(body.cap) && body.cap >= 1
          ? Math.floor(body.cap)
          : DEFAULT_PLAYER_BOT_CAP;
      return {
        ok: true,
        bots,
        cap,
        ownedCount: typeof body.ownedCount === 'number' ? body.ownedCount : bots.length,
        activeCharacterId:
          typeof body.activeCharacterId === 'string' && body.activeCharacterId.trim()
            ? body.activeCharacterId.trim()
            : null,
      };
    } catch (err) {
      return {
        ok: false,
        code: 'network_error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async suggestBotName(accessToken: string): Promise<SuggestBotNameResult> {
    try {
      const res = await fetch(`${this.config.url}/rest/v1/rpc/${SUGGEST_BOT_NAME_RPC}`, {
        method: 'POST',
        headers: {
          ...this.headers(accessToken),
          Prefer: 'return=representation',
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as RpcErrorBody;
        return {
          ok: false,
          code: resolveTransportFailureCode({
            code: err.code ?? `http_${res.status}`,
            message: err.message,
            httpStatus: res.status,
          }),
          message: err.message ?? 'Could not suggest a name.',
        };
      }
      const body = (await res.json()) as SuggestBotNameRpcOk | MultiBotRpcFail | null;
      if (!body || typeof body !== 'object' || body.ok !== true) {
        return {
          ok: false,
          code: (body && 'code' in body && body.code) || 'invalid_response',
          message: (body && 'message' in body && body.message) || 'Could not suggest a name.',
        };
      }
      const displayName = playerFacingDisplayName(body.displayName).slice(0, 12);
      if (!displayName.trim()) {
        return { ok: false, code: 'invalid_response', message: 'Could not suggest a name.' };
      }
      return { ok: true, displayName };
    } catch (err) {
      return {
        ok: false,
        code: 'network_error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async createOwnedBot(input: CreateOwnedBotInput): Promise<CreateOwnedBotResult> {
    try {
      const res = await fetch(`${this.config.url}/rest/v1/rpc/${CREATE_OWNED_CHARACTER_RPC}`, {
        method: 'POST',
        headers: {
          ...this.headers(input.accessToken),
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          p_display_name: input.displayName,
          p_paint: input.paint,
          p_weapon: input.weapon,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as RpcErrorBody;
        const code = resolveTransportFailureCode({
          code: err.code ?? `http_${res.status}`,
          message: err.message ?? err.details,
          httpStatus: res.status,
        });
        return {
          ok: false,
          code,
          message: multiBotPlayerMessage(code, err.message ?? err.details),
        };
      }
      const body = (await res.json()) as CreateOwnedCharacterRpcOk | MultiBotRpcFail | null;
      if (!body || typeof body !== 'object' || body.ok !== true) {
        const code = (body && 'code' in body && body.code) || 'invalid_response';
        return {
          ok: false,
          code,
          message: multiBotPlayerMessage(
            code,
            (body && 'message' in body && body.message) || undefined,
          ),
        };
      }
      const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
      const displayName = playerFacingDisplayName(
        typeof body.displayName === 'string' ? body.displayName : '',
      );
      if (!characterId || !displayName.trim()) {
        return {
          ok: false,
          code: 'invalid_response',
          message: 'Could not create your bot. Try again.',
        };
      }
      return {
        ok: true,
        characterId,
        displayName,
        ...(typeof body.cap === 'number' ? { cap: body.cap } : {}),
        ...(typeof body.ownedCount === 'number' ? { ownedCount: body.ownedCount } : {}),
      };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        code: 'network_error',
        message: multiBotPlayerMessage('network_error', raw),
      };
    }
  }

  async selectActiveBot(input: {
    characterId: string;
    accessToken: string;
  }): Promise<SelectActiveBotResult> {
    try {
      const res = await fetch(`${this.config.url}/rest/v1/rpc/${SELECT_ACTIVE_CHARACTER_RPC}`, {
        method: 'POST',
        headers: {
          ...this.headers(input.accessToken),
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ p_character_id: input.characterId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as RpcErrorBody;
        const code = resolveTransportFailureCode({
          code: err.code ?? `http_${res.status}`,
          message: err.message ?? err.details,
          httpStatus: res.status,
        });
        return {
          ok: false,
          code,
          message: multiBotPlayerMessage(code, err.message ?? err.details),
        };
      }
      const body = (await res.json()) as SelectActiveCharacterRpcOk | MultiBotRpcFail | null;
      if (!body || typeof body !== 'object' || body.ok !== true) {
        const code = (body && 'code' in body && body.code) || 'invalid_response';
        return {
          ok: false,
          code,
          message: multiBotPlayerMessage(
            code,
            (body && 'message' in body && body.message) || undefined,
          ),
        };
      }
      const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
      const displayName = playerFacingDisplayName(
        typeof body.displayName === 'string' ? body.displayName : '',
      );
      if (!characterId || !displayName.trim()) {
        return {
          ok: false,
          code: 'invalid_response',
          message: 'Could not select that bot.',
        };
      }
      return { ok: true, characterId, displayName };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        code: 'network_error',
        message: multiBotPlayerMessage('network_error', raw),
      };
    }
  }

  private headers(accessToken: string): Record<string, string> {
    return {
      apikey: this.config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }
}

function normalizeOwnedBotRow(row: OwnedBotRpcRow | Record<string, unknown>): OwnedBotSummary | null {
  const characterId =
    typeof row.characterId === 'string' ? row.characterId.trim() : '';
  if (!characterId) return null;
  const rawName = typeof row.displayName === 'string' ? row.displayName : '';
  return {
    characterId,
    displayName: playerFacingDisplayName(rawName),
    wins: typeof row.wins === 'number' && Number.isFinite(row.wins) ? Math.max(0, row.wins) : 0,
    losses:
      typeof row.losses === 'number' && Number.isFinite(row.losses) ? Math.max(0, row.losses) : 0,
    paint: typeof row.paint === 'string' && row.paint.trim() ? row.paint.trim() : null,
    weapon: typeof row.weapon === 'string' && row.weapon.trim() ? row.weapon.trim() : null,
    atlasVersion:
      typeof row.atlasVersion === 'string' && row.atlasVersion.trim()
        ? row.atlasVersion.trim()
        : null,
    isActive: row.isActive === true,
  };
}

function multiBotPlayerMessage(code: string, fallback?: string): string {
  switch (code) {
    case 'bot_cap_reached':
      return 'Your Ludus is full';
    case 'name_taken':
      return 'You already have a bot with that name';
    case 'invalid_display_name':
      return typeof fallback === 'string' && fallback.trim()
        ? fallback
        : 'That name is not allowed';
    case 'not_owned':
      return 'That bot is not yours';
    case 'network_error':
      return 'Connection problem. Try again.';
    default:
      return typeof fallback === 'string' && fallback.trim()
        ? fallback
        : 'Something went wrong. Try again.';
  }
}
