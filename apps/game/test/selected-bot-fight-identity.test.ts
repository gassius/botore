/**
 * BT-272 — selected Ludus bot must own fight header name + sealed attacker id.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyActiveFlagToOwnedBots } from '../src/garage/loadout/applyActiveFlagToOwnedBots';
import type { OwnedBotSummary } from '../src/garage/loadout/loadoutTypes';
import {
  readReplayAttackerDisplayName,
  readReplayAttackerId,
  sealedBuildWithCharacterId,
  selectedBotFightHeaderName,
  selectedBotMatchesFightAttacker,
} from '../src/fight/selectedBotFightIdentity';

const gameRoot = process.cwd();

function bot(partial: Partial<OwnedBotSummary> & { characterId: string }): OwnedBotSummary {
  return {
    characterId: partial.characterId,
    displayName: partial.displayName ?? partial.characterId,
    wins: partial.wins ?? 0,
    losses: partial.losses ?? 0,
    isActive: partial.isActive ?? false,
    paint: partial.paint ?? 'paint-crimson',
    weapon: partial.weapon ?? 'weapon-sword',
    head: partial.head ?? null,
    body: partial.body ?? null,
    arms: partial.arms ?? null,
    legs: partial.legs ?? null,
    atlasVersion: partial.atlasVersion ?? 'v1',
  };
}

describe('selected bot fight identity (BT-272)', () => {
  it('applyActiveFlagToOwnedBots marks only the selected bot active', () => {
    const bots = [
      bot({ characterId: 'bot-gaskiller', displayName: 'GASKILLER', isActive: true }),
      bot({ characterId: 'bot-ash-crown', displayName: 'Ash Crown', isActive: false }),
    ];
    const next = applyActiveFlagToOwnedBots(bots, 'bot-ash-crown');
    expect(next.map((b) => ({ id: b.characterId, active: b.isActive }))).toEqual([
      { id: 'bot-gaskiller', active: false },
      { id: 'bot-ash-crown', active: true },
    ]);
  });

  it('header name prefers replay attacker displayName (selected non-first bot)', () => {
    const name = selectedBotFightHeaderName({
      selectedDisplayName: 'Ash Crown',
      fighters: [
        { characterId: 'bot-ash-crown', displayName: 'Ash Crown' },
        { characterId: 'opp-sir-bot', displayName: 'Rivet Nan' },
      ],
    });
    expect(name.toUpperCase()).toContain('ASH');
    expect(name.toUpperCase()).not.toContain('GASKILLER');
  });

  it('selectedBotMatchesFightAttacker fails when replay attacker is the first/default bot', () => {
    expect(
      selectedBotMatchesFightAttacker({
        selectedCharacterId: 'bot-ash-crown',
        replayAttackerCharacterId: 'bot-gaskiller',
      }),
    ).toBe(false);
    expect(
      selectedBotMatchesFightAttacker({
        selectedCharacterId: 'bot-ash-crown',
        replayAttackerCharacterId: 'bot-ash-crown',
      }),
    ).toBe(true);
  });

  it('sealedBuildWithCharacterId stamps the Ludus-selected id onto attacker builds', () => {
    const stamped = sealedBuildWithCharacterId(
      {
        chassis: 'chassis-basic',
        paint: 'paint-cobalt',
        weapon: 'weapon-axe',
      },
      'bot-ash-crown',
    );
    expect(stamped.characterId).toBe('bot-ash-crown');
    expect(stamped.paint).toBe('paint-cobalt');
  });

  it('readReplayAttacker* extracts sealed fighter identity for capture proof', () => {
    const replay = {
      fighters: [
        { characterId: 'bot-ash-crown', displayName: 'Ash Crown' },
        { characterId: 'opp-sir-bot', displayName: 'Rivet Nan' },
      ],
    };
    expect(readReplayAttackerId(replay)).toBe('bot-ash-crown');
    expect(readReplayAttackerDisplayName(replay)).toBe('Ash Crown');
  });

  it('migration 0040 resolves attacker via active_character_id (not bare LIMIT 1)', () => {
    const sql = readFileSync(
      join(gameRoot, '../../supabase/migrations/0040_prepare_fight_active_character.sql'),
      'utf8',
    );
    expect(sql).toContain('active_character_id');
    expect(sql).toMatch(/select a\.active_character_id into v_active/i);
    // Must not keep the pre-E4 "first row wins" attacker pick as the primary path.
    expect(sql).not.toMatch(/where c\.account_id = p_account_id\s+limit 1;/i);
  });

  it('Find opponent awaits in-flight selectActiveBot (StableScreen)', () => {
    const src = readFileSync(join(gameRoot, 'src/garage/screens/StableScreen.tsx'), 'utf8');
    expect(src).toContain('selectPromiseRef');
    expect(src).toContain('handleFindOpponent');
    expect(src).toMatch(/selectPromiseRef\.current/);
  });

  it('selectActiveBot optimistically flips ownedBots isActive', () => {
    const src = readFileSync(join(gameRoot, 'src/garage/LoadoutSessionContext.tsx'), 'utf8');
    expect(src).toContain('applyActiveFlagToOwnedBots');
  });
});
