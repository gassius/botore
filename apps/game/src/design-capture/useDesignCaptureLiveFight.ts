import { useEffect, useRef } from 'react';
import { useFightSession } from '../fight';
import {
  readReplayAttackerDisplayName,
  readReplayAttackerId,
} from '../fight/selectedBotFightIdentity';
import { useGarageSession } from '../garage/LoadoutSessionContext';
import { useFirstRun } from '../first-run/FirstRunContext';
import { countFxEventsFromReplay } from '../replay/fxCaptureHold';
import { isDesignCaptureEnabled, isLiveFightCaptureEnabled } from './captureEnv';
import { loadoutHasCaptureWeapon, resolveCaptureWeaponCatalogueId } from './captureWeapon';
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
  /** A4 shapes sealed into fight builds (Customise parity). */
  readonly attackerHead?: string | null;
  readonly attackerBody?: string | null;
  readonly attackerArms?: string | null;
  readonly attackerLegs?: string | null;
  /** Sealed replay attacker — must match Ludus-selected bot (BT-272). */
  readonly attackerCharacterId?: string;
  readonly attackerDisplayName?: string;
  readonly selectedCharacterId?: string;
  /** Recorded FX event counts from the sealed replay (not client invent). */
  readonly fxEvents: { readonly hit: number; readonly dodge: number; readonly defeat: number };
};

function logFightProof(proof: CaptureFightProof): void {
  // Android CI greps logcat; iOS CI reads Documents/botore-capture-fight-proof.json.
  console.log(`BOTORE_CAPTURE_FIGHT_JSON:${JSON.stringify(proof)}`);
  void writeFightProofFile(proof);
}

/**
 * Design-capture fight fixtures (C3 + web preview).
 *
 * Always (design-capture):
 * - On ConfirmFight: refresh roster + select first fight-ready opponent so the
 *   Confirm still is not the "No opponent selected" guard.
 *
 * When `EXPO_PUBLIC_DESIGN_CAPTURE_LIVE_FIGHT=1` and Supabase public env is baked:
 * - Pin capture weapon (e.g. axe) onto the confirmed loadout before combat-v1.
 * - On Replay: start combat-v1 once if needed so playback is server-precomputed.
 * - Emit fight proof to logcat for the CI manifest.
 *
 * Web preview Replay/FightResult stills use `?result=` golden fixtures instead
 * of live combat-v1 (no Edge Function required).
 */
export function useDesignCaptureLiveFight(): void {
  const liveFight = isLiveFightCaptureEnabled();
  const designCapture = isDesignCaptureEnabled();
  const { route } = useFirstRun();
  const { canProgress, session, loadout, selectWeapon, save } = useGarageSession();
  const selectedCharacterId = loadout.characterId;
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
  const weaponSaveInFlight = useRef(false);
  const wantedWeapon = resolveCaptureWeaponCatalogueId();

  useEffect(() => {
    if (!designCapture) return;
    const needRoster =
      route === 'ConfirmFight' || (liveFight && (route === 'Replay' || route === 'FightResult'));
    if (!needRoster) return;
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
    designCapture,
    liveFight,
    session,
    canProgress,
    route,
    refreshCandidates,
    loadout.hydration,
    loadout.lastError,
  ]);

  // A2b: pin axe (or other capture weapon) on confirmed loadout before startFight
  // so Fight View sealed builds show the right blade + smears.
  useEffect(() => {
    if (!liveFight || !canProgress || !session) return;
    if (route !== 'ConfirmFight' && route !== 'Replay' && route !== 'Customise') return;
    if (!wantedWeapon) return;
    if (loadoutHasCaptureWeapon(loadout.confirmedLoadout?.weapon, wantedWeapon)) return;
    if (loadout.saving || weaponSaveInFlight.current) return;

    if (loadout.pendingLoadout?.weapon !== wantedWeapon) {
      selectWeapon(wantedWeapon);
      console.log(`BOTORE_CAPTURE_WEAPON_PIN:pending=${wantedWeapon}`);
      return;
    }
    if (!loadout.dirty) return;

    weaponSaveInFlight.current = true;
    void save()
      .then((ok) => {
        console.log(
          ok
            ? `BOTORE_CAPTURE_WEAPON_PIN:saved=${wantedWeapon}`
            : `BOTORE_CAPTURE_FIGHT_ERROR:weapon save failed wanted=${wantedWeapon}`,
        );
      })
      .finally(() => {
        weaponSaveInFlight.current = false;
      });
  }, [
    liveFight,
    canProgress,
    session,
    route,
    wantedWeapon,
    loadout.confirmedLoadout?.weapon,
    loadout.pendingLoadout?.weapon,
    loadout.dirty,
    loadout.saving,
    selectWeapon,
    save,
  ]);

  useEffect(() => {
    if (!designCapture || !canProgress) return;
    const needSelect = route === 'ConfirmFight' || (liveFight && route === 'Replay');
    if (!needSelect) return;
    if (list.status !== 'ready' || list.candidates.length < 1) return;
    if (selected) return;
    selectOpponent(list.candidates[0]!);
  }, [designCapture, liveFight, canProgress, route, list, selected, selectOpponent]);

  useEffect(() => {
    if (!liveFight || !canProgress || !session) return;
    if (route !== 'Replay') return;
    if (lastFight) return;
    if (!selected || fightInFlight) return;
    if (fightKind !== 'supabase') {
      console.warn(
        'BOTORE_CAPTURE_FIGHT_ERROR:live fight capture requires supabase fight adapter (bake EXPO_PUBLIC_SUPABASE_*)',
      );
      return;
    }
    if (!loadoutHasCaptureWeapon(loadout.confirmedLoadout?.weapon, wantedWeapon)) {
      console.log(
        `BOTORE_CAPTURE_WEAPON_PIN:waiting confirmed=${loadout.confirmedLoadout?.weapon ?? 'none'} wanted=${wantedWeapon ?? 'none'}`,
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
    liveFight,
    canProgress,
    session,
    route,
    lastFight,
    selected,
    fightInFlight,
    fightKind,
    startFight,
    wantedWeapon,
    loadout.confirmedLoadout?.weapon,
  ]);

  useEffect(() => {
    if (!liveFight || !lastFight?.sealedBuilds) return;
    if (proofLoggedForBattle.current === lastFight.battleId) return;
    proofLoggedForBattle.current = lastFight.battleId;
    // Persist full fight so FightResult can restore after iOS process relaunch.
    void writeLastFightFile(lastFight);
    const attackerCharacterId = readReplayAttackerId(lastFight.replay) ?? undefined;
    const attackerDisplayName = readReplayAttackerDisplayName(lastFight.replay) ?? undefined;
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
      attackerHead: lastFight.sealedBuilds.attacker.head ?? null,
      attackerBody: lastFight.sealedBuilds.attacker.body ?? null,
      attackerArms: lastFight.sealedBuilds.attacker.arms ?? null,
      attackerLegs: lastFight.sealedBuilds.attacker.legs ?? null,
      ...(attackerCharacterId ? { attackerCharacterId } : {}),
      ...(attackerDisplayName ? { attackerDisplayName } : {}),
      ...(selectedCharacterId ? { selectedCharacterId } : {}),
      fxEvents: countFxEventsFromReplay(lastFight.replay),
    });
  }, [liveFight, lastFight, selectedCharacterId]);
}
