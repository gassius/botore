import { describe, it, expect } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  CreateBattleRequestSchema,
  BattleStartedResponseSchema,
  OpponentSchema,
  opponentToFighterSnapshot,
  BotLoadoutSchema,
  SaveBotLoadoutRequestSchema,
  BackendHealthSchema,
  CataloguePartSchema,
} from '../src/index.js';

describe('API contracts', () => {
  it('accepts a valid battle request and rejects malformed payloads', () => {
    const ok = { opponentId: 'opponent-1' };
    expect(Value.Check(CreateBattleRequestSchema, ok)).toBe(true);
    for (const bad of [{}, { opponentId: '' }, { opponentId: 42 }, [], null, 'x']) {
      expect(Value.Check(CreateBattleRequestSchema, bad)).toBe(false);
    }
  });

  it('validates battle response shape (uuid, outcome, xp bounds)', () => {
    const ok = {
      battleId: '0b3f7c9e-1111-4222-8333-944455566677',
      status: 'completed',
      outcome: { winner: 'knight', reason: 'defeat' },
      xpAwarded: 2,
      replayChecksum: 'a'.repeat(64),
    };
    expect(Value.Check(BattleStartedResponseSchema, ok)).toBe(true);
    expect(Value.Check(BattleStartedResponseSchema, { ...ok, xpAwarded: 3 })).toBe(false);
    expect(Value.Check(BattleStartedResponseSchema, { ...ok, battleId: 'nope' })).toBe(false);
  });

  it('opponent schema rejects negative stats', () => {
    expect(
      Value.Check(OpponentSchema, {
        characterId: 'o1',
        displayName: 'O',
        hp: 10,
        strength: -1,
        agility: 1,
        speed: 1,
        weaponKind: 'sword',
        weaponPower: 1,
      }),
    ).toBe(false);
  });

  it('maps opponent → fighter snapshot', () => {
    const snap = opponentToFighterSnapshot({
      characterId: 'o1',
      displayName: 'One',
      hp: 12,
      strength: 3,
      agility: 4,
      speed: 5,
      weaponKind: 'axe',
      weaponPower: 2,
    });
    expect(snap).toEqual({
      characterId: 'o1',
      displayName: 'One',
      hp: 12,
      strength: 3,
      agility: 4,
      speed: 5,
      weaponKind: 'axe',
      weaponPower: 2,
    });
  });

  it('accepts proof catalogue part and bot loadout shapes', () => {
    expect(
      Value.Check(CataloguePartSchema, {
        partId: 'weapon-sword',
        slotKind: 'weapon',
        displayName: 'Sword',
        weaponKind: 'sword',
        weaponPower: 3,
        soundTags: ['weapon.sword'],
        mediaKey: 'parts/weapon-sword',
        isActive: true,
      }),
    ).toBe(true);

    expect(
      Value.Check(BotLoadoutSchema, {
        chassis: 'chassis-basic',
        paint: 'paint-crimson',
        weapon: 'weapon-sword',
        shield: null,
        drone: null,
        decals: [],
        soundTags: ['chassis.light', 'weapon.sword'],
      }),
    ).toBe(true);

    expect(
      Value.Check(SaveBotLoadoutRequestSchema, {
        characterId: 'player-hero',
        loadout: {
          chassis: 'chassis-basic',
          paint: 'paint-crimson',
          weapon: 'weapon-sword',
        },
        atlasVersion: 'v1',
      }),
    ).toBe(true);
  });

  it('validates backend health snapshot envelope', () => {
    expect(
      Value.Check(BackendHealthSchema, {
        status: 'ok',
        service: 'health',
        checks: { database: true },
        checked_at: '2026-11-08T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(Value.Check(BackendHealthSchema, { status: 'nope', checks: {} })).toBe(false);
  });
});
