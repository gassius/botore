import type { SupabasePublicConfig } from '../../garage/auth/supabasePublicConfig';
import { normalizeGarageLoadout } from '../../garage/loadout/normalizeLoadout';
import { summarizeAllowanceRows } from './allowanceSummary';
import type { OpponentCandidatesPort } from './OpponentCandidatesPort';
import type { ListCandidatesResult, OpponentCandidate, PrepareEligibilityResult } from './types';

type ErrBody = { message?: string; code?: string; details?: string; hint?: string };

/**
 * Live reads:
 * - `characters` (RLS: is_opponent=true)
 * - `current_bot_loadouts` (opponent loadouts readable)
 * - `fight_allowances` (own rows; day/count derived from server data, not device clock)
 * - `prepare_fight_context` RPC for eligibility (does not consume allowance)
 *
 * Does NOT invent ranking / freshness / anti-farming — that RPC does not exist.
 */
export class SupabaseOpponentCandidatesAdapter implements OpponentCandidatesPort {
  readonly kind = 'supabase' as const;

  constructor(private readonly config: SupabasePublicConfig) {}

  async listCandidates(input: {
    accessToken: string;
    accountId: string;
  }): Promise<ListCandidatesResult> {
    try {
      const [charsRes, allowRes] = await Promise.all([
        fetch(
          `${this.config.url}/rest/v1/characters?is_opponent=eq.true&select=character_id,display_name&order=character_id.asc`,
          { headers: this.headers(input.accessToken) },
        ),
        // No device-calendar filter — derive the active UTC day from returned rows.
        fetch(
          `${this.config.url}/rest/v1/fight_allowances?account_id=eq.${encodeURIComponent(input.accountId)}&select=utc_day,used_at,slot_index&order=utc_day.desc`,
          { headers: this.headers(input.accessToken) },
        ),
      ]);

      if (!charsRes.ok) {
        const err = (await charsRes.json().catch(() => ({}))) as ErrBody;
        return {
          ok: false,
          code: err.code ?? `http_${charsRes.status}`,
          message: err.message ?? `Failed to load opponents (${charsRes.status})`,
        };
      }
      if (!allowRes.ok) {
        const err = (await allowRes.json().catch(() => ({}))) as ErrBody;
        return {
          ok: false,
          code: err.code ?? `http_${allowRes.status}`,
          message: err.message ?? `Failed to load fight allowance (${allowRes.status})`,
        };
      }

      const chars = (await charsRes.json()) as Array<{
        character_id?: string;
        display_name?: string;
      }>;
      const allowRows = (await allowRes.json()) as Array<{
        utc_day?: unknown;
        used_at?: unknown;
      }>;
      const { utcDay, allowancesRemaining } = summarizeAllowanceRows(
        Array.isArray(allowRows) ? allowRows : [],
      );

      if (chars.length === 0) {
        return { ok: true, candidates: [], allowancesRemaining, utcDay };
      }

      const ids = chars
        .map((c) => c.character_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      const loadoutUrl = new URL(`${this.config.url}/rest/v1/current_bot_loadouts`);
      loadoutUrl.searchParams.set('character_id', `in.(${ids.join(',')})`);
      loadoutUrl.searchParams.set(
        'select',
        'character_id,loadout_version_id,loadout,atlas_version',
      );

      const loadRes = await fetch(loadoutUrl.toString(), {
        headers: this.headers(input.accessToken),
      });
      if (!loadRes.ok) {
        const err = (await loadRes.json().catch(() => ({}))) as ErrBody;
        return {
          ok: false,
          code: err.code ?? `http_${loadRes.status}`,
          message: err.message ?? `Failed to load opponent loadouts (${loadRes.status})`,
          allowancesRemaining,
          utcDay,
        };
      }

      const loadRows = (await loadRes.json()) as Array<Record<string, unknown>>;
      const byId = new Map<string, OpponentCandidate>();
      for (const row of loadRows) {
        const characterId = String(row.character_id ?? '');
        if (!characterId) continue;
        byId.set(characterId, {
          characterId,
          displayName: characterId,
          loadout: normalizeGarageLoadout(row.loadout),
          loadoutVersionId:
            typeof row.loadout_version_id === 'string' ? row.loadout_version_id : null,
          atlasVersion: String(row.atlas_version ?? 'v1'),
        });
      }

      const candidates: OpponentCandidate[] = [];
      for (const c of chars) {
        const id = c.character_id;
        if (!id) continue;
        const withLoadout = byId.get(id);
        if (!withLoadout) continue; // incomplete opponent — not fight-ready
        candidates.push({
          ...withLoadout,
          displayName:
            typeof c.display_name === 'string' && c.display_name.trim().length > 0
              ? c.display_name
              : id,
        });
      }

      return { ok: true, candidates, allowancesRemaining, utcDay };
    } catch (err) {
      return {
        ok: false,
        code: 'network_error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async prepareEligibility(input: {
    accessToken: string;
    accountId: string;
    opponentId: string;
  }): Promise<PrepareEligibilityResult> {
    try {
      const res = await fetch(`${this.config.url}/rest/v1/rpc/prepare_fight_context`, {
        method: 'POST',
        headers: {
          ...this.headers(input.accessToken),
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          p_account_id: input.accountId,
          p_opponent_id: input.opponentId,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as ErrBody;
        const code = err.code ?? `http_${res.status}`;
        return {
          ok: false,
          code: code === '42501' ? 'forbidden' : code,
          message: err.message ?? err.details ?? `Eligibility check failed (${res.status})`,
        };
      }
      const ctx = (await res.json()) as Record<string, unknown>;
      if (!ctx || typeof ctx !== 'object') {
        return { ok: false, code: 'invalid_response', message: 'Malformed fight context' };
      }
      if (ctx.ok !== true) {
        const failed: PrepareEligibilityResult = {
          ok: false,
          code: String(ctx.code ?? 'not_eligible'),
          message: String(ctx.message ?? 'Not eligible to fight'),
          ...(typeof ctx.allowancesRemaining === 'number'
            ? { allowancesRemaining: ctx.allowancesRemaining }
            : {}),
          ...(typeof ctx.utcDay === 'string' ? { utcDay: ctx.utcDay } : {}),
        };
        return failed;
      }

      const defenderRaw = ctx.defender as Record<string, unknown> | undefined;
      const attackerRaw = ctx.attacker as Record<string, unknown> | undefined;
      if (typeof ctx.utcDay !== 'string' || ctx.utcDay.length < 1) {
        return {
          ok: false,
          code: 'invalid_response',
          message: 'prepare_fight_context omitted server utcDay',
        };
      }

      return {
        ok: true,
        code: 'eligible',
        allowancesRemaining: Number(ctx.allowancesRemaining ?? 0),
        utcDay: ctx.utcDay,
        rulesVersion: String(ctx.rulesVersion ?? 'combat-v1'),
        attackerName: String(attackerRaw?.displayName ?? 'You'),
        defenderName: String(defenderRaw?.displayName ?? input.opponentId),
        defenderWeaponKind: String(defenderRaw?.weaponKind ?? 'sword'),
        defenderLoadoutVersionId:
          typeof defenderRaw?.loadoutVersionId === 'string' ? defenderRaw.loadoutVersionId : null,
        defenderAtlasVersion: String(defenderRaw?.atlasVersion ?? 'v1'),
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
