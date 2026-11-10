import type { SupabasePublicConfig } from '../../garage/auth/supabasePublicConfig';
import { resolveTransportFailureCode } from '../../session-failure';
import {
  LIST_RANKING_RPC,
  type ClientReadRpcFail,
  type ListRankingRpcOk,
} from '../../supabase/clientReadRpcs';
import type { RankingReadPort } from '../RankingReadPort';
import { RankingTransportError } from '../RankingReadPort';
import type { RankingRow } from '../types';

type ErrBody = { message?: string; code?: string; details?: string; hint?: string };

/**
 * Live ranking via `list_ranking` SECURITY DEFINER RPC.
 * Preserves server order verbatim — no client re-sort or rank rewrite.
 */
export class SupabaseRankingReadAdapter implements RankingReadPort {
  readonly kind = 'supabase' as const;

  constructor(
    private readonly config: SupabasePublicConfig,
    private readonly accessToken: string,
  ) {}

  async list(): Promise<readonly RankingRow[]> {
    const res = await fetch(`${this.config.url}/rest/v1/rpc/${LIST_RANKING_RPC}`, {
      method: 'POST',
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as ErrBody;
      const message = err.message ?? err.details ?? `list_ranking failed (${res.status})`;
      const code = resolveTransportFailureCode({
        code: err.code ?? `http_${res.status}`,
        message,
        httpStatus: res.status,
      });
      throw new RankingTransportError(code, message);
    }

    const body = (await res.json()) as ListRankingRpcOk | ClientReadRpcFail | null;
    if (!body || typeof body !== 'object') {
      throw new Error('list_ranking returned a malformed body');
    }
    if (body.ok !== true) {
      const message = body.message ?? body.code ?? 'list_ranking failed';
      const code = resolveTransportFailureCode({
        code: body.code ?? 'list_ranking_failed',
        message,
      });
      if (code === 'network_error' || code === 'unauthenticated') {
        throw new RankingTransportError(code, message);
      }
      throw new Error(message);
    }

    // Preserve server order exactly — do not sort.
    return body.rows.map((row) => ({
      rank: row.rank,
      botId: row.characterId,
      displayName: row.displayName,
      isCurrentBot: row.isCurrentBot,
      source: 'live' as const,
      totalXp: row.totalXp,
    }));
  }
}
