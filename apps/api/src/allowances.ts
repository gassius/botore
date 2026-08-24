/**
 * UTC-day fight allowance policy (vertical slice: 3 per day).
 *
 * The DB enforces uniqueness; this module computes day boundaries and
 * remaining allowances. Pure logic, testable without a database.
 */
import { DAILY_FIGHT_ALLOWANCE } from '@botore/domain';

/** Returns the UTC date string (YYYY-MM-DD) for a timestamp. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function allowancesRemaining(usedToday: number): number {
  return Math.max(0, DAILY_FIGHT_ALLOWANCE - usedToday);
}
