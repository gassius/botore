import { useEffect, useRef } from 'react';
import { useFightSession } from '../fight';
import { useGarageSession } from '../garage/LoadoutSessionContext';
import { useFirstRun } from '../first-run/FirstRunContext';
import { countFxEventsFromReplay } from '../replay/fxCaptureHold';
import { isLiveFightCaptureEnabled } from './captureEnv';
import { writeFightProofFile, writeLastFightFile } from './readCaptureIntentFile';

export type CaptureFightProof = {
  readonly battleId: string;
  readonly replayChecksum: string;
  readonly rulesVersion: string;
  readonly xpAwarded: number;
  readonly allowancesRemaining: number;
  readonly utcDay: string;
  readonly persistence: string;
  readonly serverConfirmed: true;
  readonly attackerPaint: string;
  readonly attackerWeapon: string;
  readonly defenderPaint: string;
  readonly defenderWeapon: string;
  /** Recorded FX event counts from the sealed replay (not client invent). */
  readonly fxEvents: { readonly hit: number; readonly dodge: number; readonly defeat: number };
};

function logFightProof(proof: CaptureFightProof): void {
  // Android CI greps logcat; iOS CI reads Documents/botore-capture-fight-proof.json.
  console.log(`BOTORE_CAPTURE_FIGHT_JSON:${JSON.stringify(proof)}`);
  void writeFightProofFile(proof);
}

/**
 * C3 live-fight capture orchestrator (opt-in only).
 *
 * When `EXPO_PUBLIC_DESIGN_CAPTURE_LIVE_FIGHT=1` and Supabase public env is baked:
 * - On ConfirmFight: refresh roster + select first fight-ready opponent (dual-bot still).
 * - On Replay: start combat-v1 once if needed so playback is server-precomputed.
 * - Emit fight proof to logcat for the CI manifest.
 */
export function useDesignCaptureLiveFight(): void {
  const enabled = isLiveFightCaptureEnabled();
  const { route } = useFirstRun();
  const { canProgress, session, loadout } = useGarageSession();
  const {
    list,
    selected,
    lastFight,
    refreshCandidates,
    selectOpponent,
    startFight,
    fightKind,
    fightInFlight,
  } = useFightSession();

  const candidatesRequested = useRef(false);
  const fightStartedForKey = useRef<string | null>(null);
  const proofLoggedForBattle = useRef<string | null>(null);
  const progressBlockedLogged = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (route !== 'ConfirmFight' && route !== 'Replay' && route !== 'FightResult') return;
    if (!session) {
      if (!progressBlockedLogged.current) {
        progressBlockedLogged.current = true;
        console.warn('BOTORE_CAPTURE_FIGHT_ERROR:no session on fight route');
      }
      return;
    }
    if (!canProgress) {
      if (!progressBlockedLogged.current) {
        progressBlockedLogged.current = true;
        console.warn(
          `BOTORE_CAPTURE_FIGHT_ERROR:canProgress=false hydration=${loadout.hydration} message=${loadout.lastError ?? ''}`,
        );
      }
      return;
    }
    progressBlockedLogged.current = false;
    if (candidatesRequested.current) return;
    candidatesRequested.current = true;
    void refreshCandidates();
  }, [
    enabled,
    session,
    canProgress,
    route,
    refreshCandidates,
    loadout.hydration,
    loadout.lastError,
  ]);

  useEffect(() => {
    if (!enabled || !canProgress) return;
    if (route !== 'ConfirmFight' && route !== 'Replay') return;
    if (list.status !== 'ready' || list.candidates.length < 1) return;
    if (selected) return;
    selectOpponent(list.candidates[0]!);
  }, [enabled, canProgress, route, list, selected, selectOpponent]);

  useEffect(() => {
    if (!enabled || !canProgress || !session) return;
    if (route !== 'Replay') return;
    if (lastFight) return;
    if (!selected || fightInFlight) return;
    if (fightKind !== 'supabase') {
      console.warn(
        'BOTORE_CAPTURE_FIGHT_ERROR:live fight capture requires supabase fight adapter (bake EXPO_PUBLIC_SUPABASE_*)',
      );
      return;
    }
    const key = `${selected.characterId}:${session.userId}`;
    if (fightStartedForKey.current === key) return;
    fightStartedForKey.current = key;
    void startFight().then((fight) => {
      if (!fight) {
        fightStartedForKey.current = null;
        console.warn('BOTORE_CAPTURE_FIGHT_ERROR:startFight returned null');
      }
    });
  }, [
    enabled,
    canProgress,
    session,
    route,
    lastFight,
    selected,
    fightInFlight,
    fightKind,
    startFight,
  ]);

  useEffect(() => {
    if (!enabled || !lastFight?.sealedBuilds) return;
    if (proofLoggedForBattle.current === lastFight.battleId) return;
    proofLoggedForBattle.current = lastFight.battleId;
    // Persist full fight so FightResult can restore after iOS process relaunch.
    void writeLastFightFile(lastFight);
    logFightProof({
      battleId: lastFight.battleId,
      replayChecksum: lastFight.replayChecksum,
      rulesVersion: lastFight.rulesVersion,
      xpAwarded: lastFight.xpAwarded,
      allowancesRemaining: lastFight.allowancesRemaining,
      utcDay: lastFight.utcDay,
      persistence: String(lastFight.persistence),
      serverConfirmed: true,
      attackerPaint: lastFight.sealedBuilds.attacker.paint,
      attackerWeapon: lastFight.sealedBuilds.attacker.weapon,
      defenderPaint: lastFight.sealedBuilds.defender.paint,
      defenderWeapon: lastFight.sealedBuilds.defender.weapon,
      fxEvents: countFxEventsFromReplay(lastFight.replay),
    });
  }, [enabled, lastFight]);
}
