import type { SupabasePublicConfig } from '../../garage/auth/supabasePublicConfig';
import { normalizeGarageLoadout } from '../../garage/loadout/normalizeLoadout';
import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { resolveTransportFailureCode } from '../../session-failure';
import {
  FIGHT_ALLOWANCE_SUMMARY_RPC,
  OPPONENT_ROSTER_RPC,
  type ClientReadRpcFail,
  type FightAllowanceSummaryRpcOk,
  type OpponentRosterRpcOk,
} from '../../supabase/clientReadRpcs';
import type { OpponentCandidatesPort } from './OpponentCandidatesPort';
import type { ListCandidatesResult, OpponentCandidate, PrepareEligibilityResult } from './types';

type ErrBody = { message?: string; code?: string; details?: string; hint?: string };

/**
 * Live reads via ticket-B SECURITY DEFINER RPCs + sanctioned loadout view:
 * - `list_opponent_roster` (system opponents for Confirm / prepare_fight_context)
 * - `get_fight_allowance_summary` ({ utcDay, allowancesRemaining })
 * - `current_bot_loadouts` (opponent loadouts once character ids are known)
 * - `prepare_fight_context` RPC for eligibility (does not consume allowance)
 *
 * Does NOT SELECT characters / fight_allowances / profiles tables.
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
      const [rosterRes, allowRes] = await Promise.all([
        fetch(`${this.config.url}/rest/v1/rpc/${OPPONENT_ROSTER_RPC}`, {
          method: 'POST',
          headers: {
            ...this.headers(input.accessToken),
            Prefer: 'return=representation',
          },
          body: JSON.stringify({}),
        }),
        // auth.uid()-only — empty body; B is dropping p_account_id.
        fetch(`${this.config.url}/rest/v1/rpc/${FIGHT_ALLOWANCE_SUMMARY_RPC}`, {
          method: 'POST',
          headers: {
            ...this.headers(input.accessToken),
            Prefer: 'return=representation',
          },
          body: JSON.stringify({}),
        }),
      ]);

      if (!rosterRes.ok) {
        const err = (await rosterRes.json().catch(() => ({}))) as ErrBody;
        return {
          ok: false,
          code: resolveTransportFailureCode({
            code: err.code ?? `http_${rosterRes.status}`,
            message: err.message,
            httpStatus: rosterRes.status,
          }),
          message: err.message ?? `Failed to load opponents (${rosterRes.status})`,
        };
      }
      if (!allowRes.ok) {
        const err = (await allowRes.json().catch(() => ({}))) as ErrBody;
        return {
          ok: false,
          code: resolveTransportFailureCode({
            code: err.code ?? `http_${allowRes.status}`,
            message: err.message,
            httpStatus: allowRes.status,
          }),
          message: err.message ?? `Failed to load fight allowance (${allowRes.status})`,
        };
      }

      const rosterBody = (await rosterRes.json()) as OpponentRosterRpcOk | ClientReadRpcFail | null;
      const allowBody = (await allowRes.json()) as
        FightAllowanceSummaryRpcOk | ClientReadRpcFail | null;

      if (!rosterBody || typeof rosterBody !== 'object' || rosterBody.ok !== true) {
        return {
          ok: false,
          code:
            rosterBody && typeof rosterBody === 'object' && rosterBody.ok === false
              ? (rosterBody.code ?? 'roster_unavailable')
              : 'invalid_response',
          message:
            rosterBody && typeof rosterBody === 'object' && rosterBody.ok === false
              ? (rosterBody.message ?? 'Opponent roster unavailable')
              : 'Opponent roster RPC returned a malformed body',
        };
      }

      let utcDay = '';
      let allowancesRemaining = 0;
      if (allowBody && typeof allowBody === 'object' && allowBody.ok === true) {
        utcDay = typeof allowBody.utcDay === 'string' ? allowBody.utcDay : '';
        allowancesRemaining =
          typeof allowBody.allowancesRemaining === 'number' ? allowBody.allowancesRemaining : 0;
      } else if (allowBody && typeof allowBody === 'object' && allowBody.ok === false) {
        return {
          ok: false,
          code: allowBody.code ?? 'allowance_unavailable',
          message: allowBody.message ?? 'Fight allowance summary unavailable',
        };
      } else {
        return {
          ok: false,
          code: 'invalid_response',
          message: 'Allowance summary RPC returned a malformed body',
        };
      }

      const opponents = Array.isArray(rosterBody.opponents) ? rosterBody.opponents : [];
      if (opponents.length === 0) {
        return { ok: true, candidates: [], allowancesRemaining, utcDay };
      }

      const ids = opponents
        .map((c) => (typeof c.characterId === 'string' ? c.characterId : ''))
        .filter((id) => id.length > 0);
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
          displayName: playerFacingDisplayName(characterId, characterId),
          loadout: normalizeGarageLoadout(row.loadout),
          loadoutVersionId:
            typeof row.loadout_version_id === 'string' ? row.loadout_version_id : null,
          atlasVersion: String(row.atlas_version ?? 'v2'),
        });
      }

      const candidates: OpponentCandidate[] = [];
      for (const c of opponents) {
        const id = typeof c.characterId === 'string' ? c.characterId : '';
        if (!id) continue;
        const withLoadout = byId.get(id);
        if (!withLoadout) continue; // incomplete opponent — not fight-ready
        const rawName =
          typeof c.displayName === 'string' && c.displayName.trim().length > 0
            ? c.displayName.trim()
            : id;
        candidates.push({
          ...withLoadout,
          // C16: platform ids never become opponent labels; fall back to botore id.
          displayName: playerFacingDisplayName(rawName, id),
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
        const resolved = resolveTransportFailureCode({
          code: err.code ?? `http_${res.status}`,
          message: err.message ?? err.details,
          httpStatus: res.status,
        });
        return {
          ok: false,
          code:
            resolved === 'unauthenticated'
              ? resolved
              : err.code === '42501'
                ? 'forbidden'
                : resolved,
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
