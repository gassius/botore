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

/**
 * F2 Edge Function response: full semantic replay computed server-side.
 * Persistence / XP remain F3 (`persistence: pending_f3`).
 */
export const FightComputeResponseSchema = Type.Object({
  battleId: UuidSchema,
  status: Type.Literal('computed'),
  rulesVersion: Type.Literal('combat-v1'),
  seed: Type.String({ pattern: '^[0-9a-f]{16,128}$' }),
  outcome: Type.Object({
    winner: Type.Union([IdSchema, Type.Null()]),
    reason: Type.Union([Type.Literal('defeat'), Type.Literal('action_limit_tiebreak')]),
  }),
  replay: Type.Object({
    replayVersion: Type.Integer(),
    rulesVersion: Type.String(),
    battleId: Type.String(),
    seed: Type.String(),
    inputHash: Type.String({ pattern: '^[0-9a-f]{64}$' }),
    fighters: Type.Array(Type.Unknown(), { minItems: 2, maxItems: 2 }),
    events: Type.Array(Type.Unknown(), { minItems: 1 }),
    outcome: Type.Unknown(),
    checksum: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  }),
  loadoutVersionIds: Type.Object({
    attacker: UuidSchema,
    defender: UuidSchema,
  }),
  atlasVersions: Type.Object({
    attacker: Type.String({ pattern: '^v[0-9]+$' }),
    defender: Type.String({ pattern: '^v[0-9]+$' }),
  }),
  allowancesRemaining: Type.Integer({ minimum: 0, maximum: 3 }),
  utcDay: Type.String({ minLength: 8, maxLength: 32 }),
  persistence: Type.Literal('pending_f3'),
  service: Type.Literal('combat-v1'),
});
export type FightComputeResponse = Static<typeof FightComputeResponseSchema>;

// --- Bots-as-data loadouts -------------------------------------------------

export const PartSlotKindSchema = Type.Union([
  Type.Literal('chassis'),
  Type.Literal('paint'),
  Type.Literal('weapon'),
  Type.Literal('shield'),
  Type.Literal('drone'),
  Type.Literal('decal'),
]);
export type PartSlotKindDto = Static<typeof PartSlotKindSchema>;

export const CataloguePartSchema = Type.Object({
  partId: IdSchema,
  slotKind: PartSlotKindSchema,
  displayName: Type.String({ minLength: 1, maxLength: 48 }),
  weaponKind: Type.Union([
    Type.Literal('sword'),
    Type.Literal('axe'),
    Type.Literal('dagger'),
    Type.Null(),
  ]),
  weaponPower: Type.Union([Type.Integer({ minimum: 0, maximum: 99 }), Type.Null()]),
  soundTags: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 16 }),
  mediaKey: Type.String({ minLength: 1, maxLength: 256 }),
  isActive: Type.Boolean(),
});
export type CataloguePartDto = Static<typeof CataloguePartSchema>;

export const BotLoadoutSchema = Type.Object({
  chassis: IdSchema,
  paint: IdSchema,
  weapon: IdSchema,
  shield: Type.Union([IdSchema, Type.Null()]),
  drone: Type.Union([IdSchema, Type.Null()]),
  decals: Type.Array(IdSchema, { maxItems: 8 }),
  soundTags: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 32 }),
});
export type BotLoadoutDto = Static<typeof BotLoadoutSchema>;

export const SaveBotLoadoutRequestSchema = Type.Object({
  characterId: IdSchema,
  loadout: Type.Object({
    chassis: IdSchema,
    paint: IdSchema,
    weapon: IdSchema,
    shield: Type.Optional(Type.Union([IdSchema, Type.Null()])),
    drone: Type.Optional(Type.Union([IdSchema, Type.Null()])),
    decals: Type.Optional(Type.Array(IdSchema, { maxItems: 8 })),
    soundTags: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 32 }),
    ),
  }),
  atlasVersion: Type.Optional(Type.String({ pattern: '^v[0-9]+$' })),
});
export type SaveBotLoadoutRequest = Static<typeof SaveBotLoadoutRequestSchema>;

export const SaveBotLoadoutResponseSchema = Type.Object({
  loadoutVersionId: UuidSchema,
  loadout: BotLoadoutSchema,
  atlasVersion: Type.String({ pattern: '^v[0-9]+$' }),
});
export type SaveBotLoadoutResponse = Static<typeof SaveBotLoadoutResponseSchema>;

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

/** Edge Function / SQL backend_health_snapshot response. */
export const BackendHealthSchema = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('degraded'), Type.Literal('error')]),
  service: Type.Optional(Type.String()),
  checks: Type.Record(Type.String(), Type.Unknown()),
  checked_at: Type.Optional(Type.String()),
});
export type BackendHealth = Static<typeof BackendHealthSchema>;

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
