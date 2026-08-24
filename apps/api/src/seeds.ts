/**
 * Seed selection for canonical battles.
 *
 * SECURITY: seeds come from the platform's CSPRNG via node:crypto — never
 * from Math.random() and never client-supplied. This module is the ONLY
 * non-pure randomness boundary in the API and lives outside packages/.
 */
import { randomBytes } from 'node:crypto';

export function createBattleSeed(): string {
  return randomBytes(32).toString('hex');
}
