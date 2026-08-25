/**
 * The authoritative battle transaction.
 *
 * Single SQL transaction that: locks/consumes one fight allowance, snapshots
 * both fighters, stores battle + replay + participants, appends XP to the
 * progression ledger (win=2, loss=1), and enqueues analytics outbox rows.
 * Idempotency: a unique constraint on (account_id, idempotency_key) makes
 * replays of the same command return the original result without side effects.
 */
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { type BattleEvent, type BattleReplay, type FighterSnapshot } from '@botore/replay';
import { XP_FOR_WIN, XP_FOR_LOSS } from '@botore/domain';

export class AllowanceExhaustedError extends Error {
  readonly statusCode = 409;
  constructor() {
    super('daily fight allowance exhausted');
    this.name = 'AllowanceExhaustedError';
  }
}

export class UnknownOpponentError extends Error {
  readonly statusCode = 404;
  constructor(readonly opponentId: string) {
    super(`unknown opponent: ${opponentId}`);
    this.name = 'UnknownOpponentError';
  }
}

export interface PersistBattleArgs {
  accountId: string;
  characterId: string;
  idempotencyKey: string;
  opponentId: string;
  attacker: FighterSnapshot;
  defender: FighterSnapshot;
  replay: BattleReplay;
  won: boolean;
  utcDay: string;
}

export interface PersistedBattle {
  battleId: string;
  xpAwarded: number;
  replayChecksum: string;
  winnerId: string | null;
  reason: 'defeat' | 'action_limit_tiebreak';
  repeated: boolean;
}

/**
 * Idempotent battle persistence. Returns the existing result when the same
 * (account, key) pair is retried — allowance is NOT consumed twice and XP is
 * NOT awarded twice.
 */
export async function persistBattle(
  pool: pg.Pool,
  args: PersistBattleArgs,
): Promise<PersistedBattle> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Idempotency check first — cheap unique lookup.
    const existing = await client.query<{
      battle_id: string;
      xp_awarded: number | null;
      checksum: string;
      winner_id: string | null;
      end_reason: string;
    }>(
      `SELECT b.battle_id, r.checksum, b.winner_id, b.end_reason
         FROM battle_commands c
         JOIN battles b USING (battle_id)
         LEFT JOIN battle_replays r USING (battle_id)
        WHERE c.account_id = $1 AND c.idempotency_key = $2`,
      [args.accountId, args.idempotencyKey],
    );

    if (existing.rows.length > 0 && existing.rows[0]) {
      const row = existing.rows[0];
      // XP for the original command derives from its ledger entry.
      const xpRow = await client.query<{ n: string }>(
        `SELECT coalesce(sum(delta_xp), 0)::text AS n
           FROM progression_ledger WHERE account_id = $1 AND battle_id = $2`,
        [args.accountId, row.battle_id],
      );
      await client.query('ROLLBACK');
      return {
        battleId: row.battle_id,
        xpAwarded: Number.parseInt(xpRow.rows[0]?.n ?? '0', 10),
        replayChecksum: row.checksum,
        winnerId: row.winner_id,
        reason: row.end_reason === 'action_limit_tiebreak' ? 'action_limit_tiebreak' : 'defeat',
        repeated: true,
      };
    }

    // 2) Consume one allowance atomically for today (UTC).
    const consumed = await client.query<{ fight_allowance_id: string }>(
      `UPDATE fight_allowances
          SET used_at = now()
        WHERE fight_allowance_id = (
          SELECT fa.fight_allowance_id
            FROM fight_allowances fa
           WHERE fa.account_id = $1
             AND fa.utc_day = $2
             AND fa.used_at IS NULL
           ORDER BY fa.slot_index
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
        RETURNING fight_allowance_id`,
      [args.accountId, args.utcDay],
    );
    if (consumed.rowCount !== 1) {
      throw new AllowanceExhaustedError();
    }

    // 3) Snapshot opponent must exist in the seeded roster.
    const opp = await client.query<{ character_id: string }>(
      `SELECT character_id FROM characters WHERE character_id = $1 AND is_opponent = true`,
      [args.opponentId],
    );
    if (opp.rowCount !== 1) {
      throw new UnknownOpponentError(args.opponentId);
    }

    // 4) Insert battle + participants + replay + ledger + outbox, then the
    //    idempotency row LAST so its unique constraint guards everything.
    const battleId = randomUUID();
    const xp = args.won ? XP_FOR_WIN : XP_FOR_LOSS;
    const won = args.won;
    const winnerId = args.replay.outcome.reason === 'defeat' ? args.replay.outcome.winner : null;

    await client.query(
      `INSERT INTO battles (battle_id, rules_version, seed, started_at, ended_at, winner_id, end_reason)
       VALUES ($1, $2, $3, now(), now(), $4, $5)`,
      [battleId, args.replay.rulesVersion, args.replay.seed, winnerId, args.replay.outcome.reason],
    );

    for (const [idx, f] of [
      [0, args.attacker],
      [1, args.defender],
    ] as const) {
      await client.query(
        `INSERT INTO battle_participants (battle_id, character_id, side, hp_before, hp_after, weapon_kind, weapon_power)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          battleId,
          f.characterId,
          idx === 0 ? 'attacker' : 'defender',
          f.hp,
          finalHp(args.replay, f.characterId),
          f.weaponKind,
          f.weaponPower,
        ],
      );
    }

    await client.query(
      `INSERT INTO battle_replays (battle_id, replay_version, payload, input_hash, checksum)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        battleId,
        args.replay.replayVersion,
        JSON.stringify(replayForStorage(args.replay)),
        args.replay.inputHash,
        args.replay.checksum,
      ],
    );

    await client.query(
      `INSERT INTO progression_ledger (entry_id, account_id, character_id, battle_id, delta_xp, reason)
       VALUES ($1,$2,$3,$4,$5,'battle')`,
      [randomUUID(), args.accountId, args.characterId, battleId, xp],
    );

    await client.query(
      `INSERT INTO analytics_outbox (event_id, event_name, schema_version, context, payload)
       VALUES ($1,'battle_completed',1,$2,$3)`,
      [
        randomUUID(),
        JSON.stringify({ accountId: args.accountId }),
        JSON.stringify({ battleId, won, xpAwarded: xp }),
      ],
    );

    await client.query(
      `INSERT INTO battle_commands (account_id, idempotency_key, battle_id)
       VALUES ($1,$2,$3)`,
      [args.accountId, args.idempotencyKey, battleId],
    );

    await client.query('COMMIT');
    return {
      battleId,
      xpAwarded: xp,
      replayChecksum: args.replay.checksum,
      winnerId,
      reason: args.replay.outcome.reason,
      repeated: false,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
}

// --- helpers ---------------------------------------------------------------

function finalHp(replay: BattleReplay, characterId: string): number {
  const damages = replay.events.filter(
    (e): e is Extract<BattleEvent, { type: 'damage_applied' }> =>
      e.type === 'damage_applied' && e.target === characterId,
  );
  const last = damages.at(-1);
  return last
    ? last.targetHpAfter
    : (replay.fighters.find((f) => f.characterId === characterId)?.hp ?? 0);
}

function replayForStorage(replay: BattleReplay): Record<string, unknown> {
  return replay as unknown as Record<string, unknown>;
}
