/**
 * API contracts — TypeBox schemas (runtime-validated) + static types + OpenAPI.
 *
 * ADR-0003: TypeBox chosen over Zod for JSON-Schema-native OpenAPI generation.
 * These schemas define the wire format for the vertical slice.
 */
import { Type, type Static } from '@sinclair/typebox';
import { type FighterSnapshot } from '@botore/replay';

// --- Shared ----------------------------------------------------------------

export const IdSchema = Type.String({ minLength: 1, maxLength: 64 });
export const UuidSchema = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
});

export const ErrorSchema = Type.Object({
  error: Type.String(),
  code: Type.Optional(Type.String()),
  details: Type.Optional(Type.Unknown()),
});
export type ApiError = Static<typeof ErrorSchema>;

// --- Opponents -------------------------------------------------------------

export const OpponentSchema = Type.Object({
  characterId: IdSchema,
  displayName: Type.String({ minLength: 1, maxLength: 48 }),
  hp: Type.Integer({ minimum: 1 }),
  strength: Type.Integer({ minimum: 0 }),
  agility: Type.Integer({ minimum: 0 }),
  speed: Type.Integer({ minimum: 0 }),
  weaponKind: Type.Union([Type.Literal('sword'), Type.Literal('axe'), Type.Literal('dagger')]),
  weaponPower: Type.Integer({ minimum: 0 }),
});
export type Opponent = Static<typeof OpponentSchema>;

export const OpponentListResponseSchema = Type.Object({
  opponents: Type.Array(OpponentSchema, { maxItems: 3 }),
});
export type OpponentListResponse = Static<typeof OpponentListResponseSchema>;

// --- Battles ---------------------------------------------------------------

export const CreateBattleRequestSchema = Type.Object({
  opponentId: IdSchema,
});
export type CreateBattleRequest = Static<typeof CreateBattleRequestSchema>;

export const BattleStartedResponseSchema = Type.Object({
  battleId: UuidSchema,
  status: Type.Literal('completed'),
  outcome: Type.Object({
    winner: Type.Union([IdSchema, Type.Null()]),
    reason: Type.Union([Type.Literal('defeat'), Type.Literal('action_limit_tiebreak')]),
  }),
  xpAwarded: Type.Integer({ minimum: 0, maximum: 2 }),
  replayChecksum: Type.String({ pattern: '^[0-9a-f]{64}$' }),
});
export type BattleStartedResponse = Static<typeof BattleStartedResponseSchema>;

export const ReplayResponseSchema = Type.Object({
  battleId: UuidSchema,
  replay: Type.Object({
    replayVersion: Type.Integer(),
    rulesVersion: Type.String(),
    seed: Type.String(),
    inputHash: Type.String(),
    fighters: Type.Array(Type.Unknown(), { minItems: 2, maxItems: 2 }),
    events: Type.Array(Type.Unknown(), { minItems: 1 }),
    outcome: Type.Unknown(),
    checksum: Type.String(),
  }),
});
export type ReplayResponse = Static<typeof ReplayResponseSchema>;

// --- Health ----------------------------------------------------------------

export const HealthSchema = Type.Object({
  status: Type.Literal('ok'),
  service: Type.String(),
  version: Type.String(),
});
export type Health = Static<typeof HealthSchema>;

export const ReadySchema = Type.Object({
  ready: Type.Boolean(),
  checks: Type.Record(Type.String(), Type.Boolean()),
});
export type Ready = Static<typeof ReadySchema>;

/** Converts a validated opponent into the engine's fighter snapshot shape. */
export function opponentToFighterSnapshot(o: Opponent): FighterSnapshot {
  return {
    characterId: o.characterId,
    displayName: o.displayName,
    hp: o.hp,
    strength: o.strength,
    agility: o.agility,
    speed: o.speed,
    weaponKind: o.weaponKind,
    weaponPower: o.weaponPower,
  };
}
