import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseOpponentCandidatesAdapter } from '../src/fight/candidates/SupabaseOpponentCandidatesAdapter';
import { SupabaseLoadoutSaveAdapter } from '../src/garage/loadout/SupabaseLoadoutSaveAdapter';
import { createRankingReadClient } from '../src/ranking/createRankingReadClient';
import { SupabaseRankingReadAdapter } from '../src/ranking/adapters/SupabaseRankingReadAdapter';
import {
  FIGHT_ALLOWANCE_SUMMARY_RPC,
  LIST_BOT_RANKING_RPC,
  OPPONENT_ROSTER_RPC,
  OWNED_CHARACTER_RPC,
} from '../src/supabase/clientReadRpcs';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ticket B client-read RPC adapters', () => {
  it('resolveOwnedCharacter calls get_owned_character (no characters table SELECT)', async () => {
    const fetches: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetches.push(url);
        if (url.includes(`/rpc/${OWNED_CHARACTER_RPC}`)) {
          return new Response(
            JSON.stringify({
              ok: true,
              characterId: 'player-hero',
              displayName: 'Hero',
            }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 404 });
      }),
    );

    const adapter = new SupabaseLoadoutSaveAdapter({
      url: 'http://127.0.0.1:54321',
      anonKey: 'eyJ.anon.fake',
    });
    const result = await adapter.resolveOwnedCharacter('user-jwt');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.character).toEqual({ characterId: 'player-hero', displayName: 'Hero' });
    expect(fetches).toEqual([`http://127.0.0.1:54321/rest/v1/rpc/${OWNED_CHARACTER_RPC}`]);
    expect(fetches.some((u) => u.includes('/rest/v1/characters'))).toBe(false);
  });

  it('listCandidates calls roster + allowance RPCs then current_bot_loadouts', async () => {
    const fetches: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetches.push(url);
        if (url.includes(`/rpc/${OPPONENT_ROSTER_RPC}`)) {
          return new Response(
            JSON.stringify({
              ok: true,
              opponents: [
                { characterId: 'opp-sir-bot', displayName: 'Sir Bot' },
                { characterId: 'opp-incomplete', displayName: 'Incomplete' },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes(`/rpc/${FIGHT_ALLOWANCE_SUMMARY_RPC}`)) {
          return new Response(
            JSON.stringify({
              ok: true,
              fightsRemaining: 2,
              limit: 3,
              scope: 'player',
              refillPolicy: 'daily_utc_midnight',
              nextRefillAt: '2026-11-10T00:00:00Z',
              utcDay: '2026-11-09',
              allowancesRemaining: 2,
            }),
            { status: 200 },
          );
        }
        if (url.includes('/current_bot_loadouts')) {
          return new Response(
            JSON.stringify([
              {
                character_id: 'opp-sir-bot',
                loadout_version_id: 'lv-1',
                atlas_version: 'v1',
                loadout: {
                  chassis: 'chassis-basic',
                  paint: 'paint-cobalt',
                  weapon: 'weapon-sword',
                },
              },
            ]),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 404 });
      }),
    );

    const adapter = new SupabaseOpponentCandidatesAdapter({
      url: 'http://127.0.0.1:54321',
      anonKey: 'eyJ.anon.fake',
    });
    const result = await adapter.listCandidates({
      accessToken: 'user-jwt',
      accountId: '00000000-0000-4000-8000-000000000001',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allowancesRemaining).toBe(2);
    expect(result.utcDay).toBe('2026-11-09');
    expect(result.quota.fightsRemaining).toBe(2);
    expect(result.quota.limit).toBe(3);
    expect(result.quota.scope).toBe('player');
    expect(result.quota.refillPolicy).toBe('daily_utc_midnight');
    expect(result.quota.nextRefillAt).toBe('2026-11-10T00:00:00Z');
    expect(result.candidates.map((c) => c.characterId)).toEqual(['opp-sir-bot']);
    expect(fetches.some((u) => u.includes(`/rpc/${OPPONENT_ROSTER_RPC}`))).toBe(true);
    expect(fetches.some((u) => u.includes(`/rpc/${FIGHT_ALLOWANCE_SUMMARY_RPC}`))).toBe(true);
    expect(fetches.some((u) => u.includes('/current_bot_loadouts'))).toBe(true);
    expect(fetches.some((u) => u.includes('/rest/v1/characters'))).toBe(false);
    expect(fetches.some((u) => u.includes('/rest/v1/fight_allowances'))).toBe(false);
  });

  it('list_bot_ranking adapter preserves server order and maps live rows', async () => {
    const fetches: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetches.push(url);
        if (url.includes(`/rpc/${LIST_BOT_RANKING_RPC}`)) {
          return new Response(
            JSON.stringify({
              ok: true,
              tab: 'bots',
              rows: [
                {
                  rank: 1,
                  botId: 'peer-bolt',
                  botName: 'Bolt',
                  botoreId: 'botore-steel',
                  botoreName: 'Steel Yard',
                  wins: 3,
                  losses: 1,
                  totalXp: 6,
                  portrait: {
                    chassis: 'chassis-basic',
                    paint: 'paint-crimson',
                    weapon: 'weapon-sword',
                    atlasVersion: 'v1',
                  },
                  isCurrentBot: false,
                  isNpc: true,
                },
                {
                  rank: 2,
                  botId: 'player-hero',
                  botName: 'Hero',
                  botoreId: 'botore-you',
                  botoreName: 'Carlos',
                  wins: 1,
                  losses: 1,
                  totalXp: 2,
                  portrait: {
                    chassis: 'chassis-basic',
                    paint: 'paint-cobalt',
                    weapon: 'weapon-axe',
                    atlasVersion: 'v1',
                  },
                  isCurrentBot: true,
                  isNpc: false,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 404 });
      }),
    );

    const adapter = new SupabaseRankingReadAdapter(
      { url: 'http://127.0.0.1:54321', anonKey: 'eyJ.anon.fake' },
      'user-jwt',
    );
    const rows = await adapter.list();
    expect(rows.map((r) => r.botId)).toEqual(['peer-bolt', 'player-hero']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
    expect(rows[1]?.isCurrentBot).toBe(true);
    expect(rows[0]?.source).toBe('live');
    expect(rows[0]?.wins).toBe(3);
    expect(rows[0]?.botoreName).toBe('Steel Yard');
    expect(rows[0]?.portrait?.paint).toBe('paint-crimson');
    expect(fetches).toEqual([`http://127.0.0.1:54321/rest/v1/rpc/${LIST_BOT_RANKING_RPC}`]);
    expect(fetches.some((u) => u.includes('/rest/v1/characters'))).toBe(false);
    expect(fetches.some((u) => u.includes('/rest/v1/progression_ledger'))).toBe(false);
  });

  it('createRankingReadClient forces empty/error/bots/botores capture fixtures', async () => {
    const empty = createRankingReadClient({ captureScenario: 'empty' });
    await expect(empty.list()).resolves.toEqual([]);

    const errored = createRankingReadClient({ captureScenario: 'error' });
    await expect(errored.list()).rejects.toThrow(/Could not load ranking/);

    const bots = createRankingReadClient({ captureScenario: 'bots' });
    const botRows = await bots.list();
    expect(botRows.length).toBeGreaterThan(0);
    expect(botRows[0]?.portrait?.paint).toBeTruthy();
    expect(botRows[0]?.wins).toBeGreaterThanOrEqual(0);

    const botores = createRankingReadClient({ captureScenario: 'botores' });
    const botoreRows = await botores.listBotores();
    expect(botoreRows.length).toBeGreaterThan(0);
    expect(botoreRows[0]?.wins).toBeGreaterThanOrEqual(0);
  });
});
