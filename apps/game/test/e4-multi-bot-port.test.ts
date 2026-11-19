import { describe, expect, it } from 'vitest';
import { DevLoadoutSaveAdapter } from '../src/garage/loadout/DevLoadoutSaveAdapter';
import { DEFAULT_PLAYER_BOT_CAP } from '../src/supabase/multiBotRpcs';
import {
  CREATE_OWNED_CHARACTER_RPC,
  LIST_OWNED_CHARACTERS_RPC,
  SELECT_ACTIVE_CHARACTER_RPC,
  SUGGEST_BOT_NAME_RPC,
} from '../src/supabase/multiBotRpcs';

describe('E4 multi-bot port (DEV)', () => {
  it('lists the proof bot under the server-shaped cap', async () => {
    const port = new DevLoadoutSaveAdapter();
    const listed = await port.listOwnedBots('token');
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.cap).toBe(DEFAULT_PLAYER_BOT_CAP);
    expect(listed.ownedCount).toBe(1);
    expect(listed.bots[0]?.displayName).toBe('Hero');
    expect(listed.bots[0]?.characterId).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('suggests, creates up to cap, rejects fourth, and selects active', async () => {
    const port = new DevLoadoutSaveAdapter();
    const suggested = await port.suggestBotName('token');
    expect(suggested.ok).toBe(true);
    if (!suggested.ok) return;
    expect(suggested.displayName.length).toBeLessThanOrEqual(12);

    const second = await port.createOwnedBot({
      displayName: suggested.displayName,
      paint: 'paint-cobalt',
      weapon: 'weapon-axe',
      accessToken: 'token',
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const thirdName = await port.suggestBotName('token');
    expect(thirdName.ok).toBe(true);
    if (!thirdName.ok) return;
    const third = await port.createOwnedBot({
      displayName: thirdName.displayName,
      paint: 'paint-navy',
      weapon: 'weapon-dagger',
      accessToken: 'token',
    });
    expect(third.ok).toBe(true);

    const fourth = await port.createOwnedBot({
      displayName: 'Cap Breaker',
      paint: 'paint-crimson',
      weapon: 'weapon-sword',
      accessToken: 'token',
    });
    expect(fourth.ok).toBe(false);
    if (fourth.ok) return;
    expect(fourth.code).toBe('bot_cap_reached');

    const listed = await port.listOwnedBots('token');
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.ownedCount).toBe(3);
    expect(listed.activeCharacterId).toBe(third.ok ? third.characterId : null);

    const firstId = listed.bots[0]!.characterId;
    const selected = await port.selectActiveBot({
      characterId: firstId,
      accessToken: 'token',
    });
    expect(selected.ok).toBe(true);
    const after = await port.listOwnedBots('token');
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.activeCharacterId).toBe(firstId);
  });

  it('exports RPC names for PostgREST wiring', () => {
    expect(LIST_OWNED_CHARACTERS_RPC).toBe('list_owned_characters');
    expect(CREATE_OWNED_CHARACTER_RPC).toBe('create_owned_character');
    expect(SELECT_ACTIVE_CHARACTER_RPC).toBe('select_active_character');
    expect(SUGGEST_BOT_NAME_RPC).toBe('suggest_bot_name');
  });
});
