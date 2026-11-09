/**
 * Load recorded golden replays for F10 until F9 live fight→replay wire lands.
 * Always labelled DEV — never presented as a completed backend confirmation.
 */
import { runGoldenBattle, goldenBattle } from '@botore/test-fixtures';
import { validateReplay, verifyReplay, type BattleReplay } from '@botore/replay';
import { confirmedResultFromDevReplay, type ConfirmedFightResult } from './confirmedResult';

export function loadDevGoldenConfirmedResult(index = 0): ConfirmedFightResult {
  const sealed = runGoldenBattle(goldenBattle(index));
  const replay = validateReplay(sealed);
  verifyReplay(replay);
  return confirmedResultFromDevReplay(replay);
}

/** Determinism helper: same fixture index → identical checksum + event seqs. */
export function replayIdentityFingerprint(replay: BattleReplay): string {
  const seqs = replay.events.map((e) => `${e.seq}:${e.type}`).join('|');
  return `${replay.checksum}::${seqs}`;
}
