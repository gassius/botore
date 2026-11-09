import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseOpponentCandidatesAdapter } from '../src/fight/candidates/SupabaseOpponentCandidatesAdapter';
import { SupabaseLoadoutSaveAdapter } from '../src/garage/loadout/SupabaseLoadoutSaveAdapter';
import {
  FIGHT_ALLOWANCE_SUMMARY_RPC,
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
    expect(result.candidates.map((c) => c.characterId)).toEqual(['opp-sir-bot']);
    expect(fetches.some((u) => u.includes(`/rpc/${OPPONENT_ROSTER_RPC}`))).toBe(true);
    expect(fetches.some((u) => u.includes(`/rpc/${FIGHT_ALLOWANCE_SUMMARY_RPC}`))).toBe(true);
    expect(fetches.some((u) => u.includes('/current_bot_loadouts'))).toBe(true);
    expect(fetches.some((u) => u.includes('/rest/v1/characters'))).toBe(false);
    expect(fetches.some((u) => u.includes('/rest/v1/fight_allowances'))).toBe(false);
  });
});
