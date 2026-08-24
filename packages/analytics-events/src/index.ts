/**
 * Typed, versioned analytics event catalog.
 *
 * Server-authoritative events share common context and carry a privacy
 * classification so sinks can enforce retention/redaction policy.
 * A future PostHog adapter consumes `AnalyticsEvent` values through the
 * `AnalyticsSink` interface (see src/sink.ts) — no cloud account required.
 */
import { Type, type Static } from '@sinclair/typebox';

/** Catalog version — bump when adding/removing events or fields. */
export const EVENT_CATALOG_VERSION = 1;

export const EventNameSchema = Type.Union([
  Type.Literal('account_created'),
  Type.Literal('character_created'),
  Type.Literal('opponent_list_viewed'),
  Type.Literal('opponent_selected'),
  Type.Literal('battle_requested'),
  Type.Literal('battle_completed'),
  Type.Literal('replay_started'),
  Type.Literal('replay_completed'),
  Type.Literal('xp_awarded'),
]);
export type EventName = Static<typeof EventNameSchema>;

export type PrivacyClassification = 'operational' | 'analytical' | 'sensitive';

/** Context present on every event. */
export const EventContextSchema = Type.Object({
  schemaVersion: Type.Integer(),
  occurredAt: Type.String(), // logical ISO-8601 string supplied by caller; server stamps canonical time
  accountId: Type.Optional(Type.String()),
  sessionId: Type.Optional(Type.String()),
  platform: Type.Optional(Type.String()),
  appVersion: Type.Optional(Type.String()),
});
export type EventContext = Static<typeof EventContextSchema>;

/** Per-event payloads (allowlisted, no free text). */
export const EventPayloadSchemas: Record<EventName, ReturnType<typeof Type.Object>> = {
  account_created: Type.Object({}),
  character_created: Type.Object({ characterId: Type.String() }),
  opponent_list_viewed: Type.Object({ candidateCount: Type.Integer() }),
  opponent_selected: Type.Object({ opponentId: Type.String() }),
  battle_requested: Type.Object({
    battleId: Type.String(),
    opponentId: Type.String(),
    idempotencyKeyHash: Type.String(),
  }),
  battle_completed: Type.Object({
    battleId: Type.String(),
    won: Type.Boolean(),
    xpAwarded: Type.Integer(),
  }),
  replay_started: Type.Object({ battleId: Type.String() }),
  replay_completed: Type.Object({ battleId: Type.String(), completionRatio: Type.Number() }),
  xp_awarded: Type.Object({ battleId: Type.String(), amount: Type.Integer() }),
};

export interface AnalyticsEvent {
  readonly eventId: string;
  readonly name: EventName;
  readonly source: 'server';
  readonly classification: PrivacyClassification;
  readonly context: EventContext;
  readonly payload: Record<string, unknown>;
}

const CLASSIFICATION: Record<EventName, PrivacyClassification> = {
  account_created: 'operational',
  character_created: 'operational',
  opponent_list_viewed: 'analytical',
  opponent_selected: 'analytical',
  battle_requested: 'operational',
  battle_completed: 'operational',
  replay_started: 'analytical',
  replay_completed: 'analytical',
  xp_awarded: 'operational',
};

export class AnalyticsValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[],
  ) {
    super(message);
    this.name = 'AnalyticsValidationError';
  }
}

/** Validates an unknown payload into an `AnalyticsEvent`; throws with precise issues. */
export function validateAnalyticsEvent(raw: unknown): AnalyticsEvent {
  const issues: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    throw new AnalyticsValidationError('event must be an object', ['not an object']);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r['eventId'] !== 'string' || r['eventId'].length === 0) {
    issues.push('eventId missing');
  }
  if (
    typeof r['name'] !== 'string' ||
    !ValueCheck(EventPayloadSchemas, r['name'])
  ) {
    issues.push(`unknown event name: ${String(r['name'])}`);
  }
  if (r['source'] !== 'server') {
    issues.push("source must be 'server' (client ingestion is out of scope for v1)");
  }
  const ctx = r['context'];
  if (typeof ctx !== 'object' || ctx === null) {
    issues.push('context missing');
  } else {
    const c = ctx as Record<string, unknown>;
    if (c['schemaVersion'] !== EVENT_CATALOG_VERSION) {
      issues.push(`context.schemaVersion must be ${EVENT_CATALOG_VERSION}`);
    }
    if (typeof c['occurredAt'] !== 'string') issues.push('context.occurredAt missing');
  }
  if (typeof r['payload'] !== 'object' || r['payload'] === null) {
    issues.push('payload missing');
  }
  if (issues.length > 0) throw new AnalyticsValidationError('analytics event failed validation', issues);

  return {
    eventId: r['eventId'] as string,
    name: r['name'] as EventName,
    source: 'server',
    classification: CLASSIFICATION[r['name'] as EventName],
    context: ctx as EventContext,
    payload: r['payload'] as Record<string, unknown>,
  };
}

function ValueCheck(names: Record<string, unknown>, value: unknown): boolean {
  return typeof value === 'string' && value in names;
}
