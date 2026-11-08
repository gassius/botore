import type { SupabasePublicConfig } from '../auth/supabasePublicConfig';
import type { LoadoutSavePort } from './LoadoutSavePort';
import { normalizeGarageLoadout } from './normalizeLoadout';
import type {
  FetchCurrentLoadoutResult,
  SaveLoadoutInput,
  SaveLoadoutResult,
} from './loadoutTypes';

type RpcErrorBody = {
  message?: string;
  code?: string;
  hint?: string;
  details?: string;
};

/**
 * Calls public.save_bot_loadout via PostgREST RPC with the user JWT.
 * No service-role key; RLS + SECURITY DEFINER authz remain authoritative.
 */
export class SupabaseLoadoutSaveAdapter implements LoadoutSavePort {
  readonly kind = 'supabase' as const;

  constructor(private readonly config: SupabasePublicConfig) {}

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
          code: err.code ?? `http_${res.status}`,
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
        return {
          ok: false,
          code: err.code ?? `http_${res.status}`,
          message:
            err.message ??
            err.details ??
            'Could not save changes. Your equipped loadout is unchanged.',
        };
      }
      const versionId = await res.json();
      if (typeof versionId !== 'string' || versionId.length < 1) {
        return {
          ok: false,
          code: 'invalid_response',
          message: 'Save succeeded without a loadout version id.',
        };
      }
      return {
        ok: true,
        loadoutVersionId: versionId,
        atlasVersion: input.atlasVersion,
        loadout: input.loadout,
      };
    } catch (err) {
      return {
        ok: false,
        code: 'network_error',
        message: err instanceof Error ? err.message : String(err),
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
