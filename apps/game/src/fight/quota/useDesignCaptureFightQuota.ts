import { useEffect, useMemo } from 'react';
import { type DesignCaptureFightQuotaScenario, isDesignCaptureEnabled } from '../../design-capture';
import { useFirstRun } from '../../first-run/FirstRunContext';
import type { FightListState } from '../FightSessionContext';
import {
  applyDesignCaptureFightQuotaScenario,
  formatDesignCaptureQuotaLog,
  type FightQuotaSummary,
} from './fightQuotaTypes';

/**
 * Read-time design-capture overlay for D8/D9 fights-remaining.
 * FightSessionProvider sits above FirstRunProvider, so quota forcing cannot live
 * only inside refreshCandidates — same-route `fightQuota=` deep links must react
 * here. Null scenario restores the live server quota (later snap-rest stills).
 */
export function useDesignCaptureFightQuota(list: FightListState): {
  readonly fightQuotaCaptureScenario: DesignCaptureFightQuotaScenario | null;
  readonly displayAllowancesRemaining: number | null;
  readonly displayQuota: FightQuotaSummary | null;
} {
  const { fightQuotaCaptureScenario } = useFirstRun();
  const scenario = isDesignCaptureEnabled() ? fightQuotaCaptureScenario : null;

  const baseAllowances =
    list.status === 'ready'
      ? list.allowancesRemaining
      : list.status === 'error' && typeof list.allowancesRemaining === 'number'
        ? list.allowancesRemaining
        : null;
  const baseQuota =
    list.status === 'ready' ? list.quota : list.status === 'error' ? (list.quota ?? null) : null;

  const display = useMemo(() => {
    if (baseAllowances === null && !baseQuota) {
      return {
        allowancesRemaining: null as number | null,
        quota: null as FightQuotaSummary | null,
      };
    }
    const applied = applyDesignCaptureFightQuotaScenario(scenario, {
      allowancesRemaining: baseAllowances ?? 0,
      quota: baseQuota,
    });
    return {
      allowancesRemaining: applied.allowancesRemaining,
      quota: applied.quota,
    };
  }, [scenario, baseAllowances, baseQuota]);

  useEffect(() => {
    if (!isDesignCaptureEnabled() || !display.quota) return;
    console.log(formatDesignCaptureQuotaLog(display.quota.fightsRemaining, display.quota.limit));
  }, [scenario, display.quota]);

  return {
    fightQuotaCaptureScenario: scenario,
    displayAllowancesRemaining: display.allowancesRemaining,
    displayQuota: display.quota,
  };
}
