import type { SupabasePublicConfig } from '../../garage/auth/supabasePublicConfig';
import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { resolveTransportFailureCode } from '../../session-failure';
import {
  LIST_BOT_RANKING_RPC,
  LIST_BOTORE_RANKING_RPC,
  type ClientReadRpcFail,
  type ListBotRankingRpcOk,
  type ListBotoreRankingRpcOk,
} from '../../supabase/clientReadRpcs';
import type { RankingReadPort } from '../RankingReadPort';
import { RankingTransportError } from '../RankingReadPort';
import type { BotoreRankingRow, RankingPortraitParts, RankingRow } from '../types';

type ErrBody = { message?: string; code?: string; details?: string; hint?: string };

function mapPortrait(
  raw: ListBotRankingRpcOk['rows'][number]['portrait'],
): RankingPortraitParts | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    chassis: typeof raw.chassis === 'string' ? raw.chassis : null,
    paint: typeof raw.paint === 'string' ? raw.paint : null,
    weapon: typeof raw.weapon === 'string' ? raw.weapon : null,
    head: typeof raw.head === 'string' ? raw.head : null,
    body: typeof raw.body === 'string' ? raw.body : null,
    arms: typeof raw.arms === 'string' ? raw.arms : null,
    legs: typeof raw.legs === 'string' ? raw.legs : null,
    atlasVersion: typeof raw.atlasVersion === 'string' ? raw.atlasVersion : null,
  };
}

/**
 * Live ranking via E2 `list_bot_ranking` / `list_botore_ranking`.
 * Preserves server order verbatim — no client re-sort or rank rewrite.
 */
export class SupabaseRankingReadAdapter implements RankingReadPort {
  readonly kind = 'supabase' as const;

  constructor(
    private readonly config: SupabasePublicConfig,
    private readonly accessToken: string,
  ) {}

  private async postRpc(rpc: string): Promise<Response> {
    return fetch(`${this.config.url}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({}),
    });
  }

  private async throwTransport(res: Response, label: string): Promise<never> {
    const err = (await res.json().catch(() => ({}))) as ErrBody;
    const message = err.message ?? err.details ?? `${label} failed (${res.status})`;
    const code = resolveTransportFailureCode({
      code: err.code ?? `http_${res.status}`,
      message,
      httpStatus: res.status,
    });
    throw new RankingTransportError(code, message);
  }

  async list(): Promise<readonly RankingRow[]> {
    const res = await this.postRpc(LIST_BOT_RANKING_RPC);
    if (!res.ok) {
      await this.throwTransport(res, LIST_BOT_RANKING_RPC);
    }

    const body = (await res.json()) as ListBotRankingRpcOk | ClientReadRpcFail | null;
    if (!body || typeof body !== 'object') {
      throw new Error('list_bot_ranking returned a malformed body');
    }
    if (body.ok !== true) {
      const message = body.message ?? body.code ?? 'list_bot_ranking failed';
      const code = resolveTransportFailureCode({
        code: body.code ?? 'list_bot_ranking_failed',
        message,
      });
      if (code === 'network_error' || code === 'unauthenticated') {
        throw new RankingTransportError(code, message);
      }
      throw new Error(message);
    }

    return body.rows.map((row) => ({
      rank: row.rank,
      botId: row.botId,
      displayName: playerFacingDisplayName(row.botName),
      botoreName: playerFacingDisplayName(row.botoreName),
      botoreId: row.botoreId,
      wins: row.wins,
      losses: row.losses,
      isCurrentBot: row.isCurrentBot,
      source: 'live' as const,
      totalXp: row.totalXp,
      portrait: mapPortrait(row.portrait),
    }));
  }

  async listBotores(): Promise<readonly BotoreRankingRow[]> {
    const res = await this.postRpc(LIST_BOTORE_RANKING_RPC);
    if (!res.ok) {
      await this.throwTransport(res, LIST_BOTORE_RANKING_RPC);
    }

    const body = (await res.json()) as ListBotoreRankingRpcOk | ClientReadRpcFail | null;
    if (!body || typeof body !== 'object') {
      throw new Error('list_botore_ranking returned a malformed body');
    }
    if (body.ok !== true) {
      const message = body.message ?? body.code ?? 'list_botore_ranking failed';
      const code = resolveTransportFailureCode({
        code: body.code ?? 'list_botore_ranking_failed',
        message,
      });
      if (code === 'network_error' || code === 'unauthenticated') {
        throw new RankingTransportError(code, message);
      }
      throw new Error(message);
    }

    return body.rows.map((row) => ({
      rank: row.rank,
      botoreId: row.botoreId,
      name: playerFacingDisplayName(row.name),
      emblemId: row.emblemId,
      wins: row.wins,
      losses: row.losses,
      botsOwned: row.botsOwned,
      botPaints: [],
      isCurrentBotore: row.isCurrentBotore,
      source: 'live' as const,
    }));
  }
}
