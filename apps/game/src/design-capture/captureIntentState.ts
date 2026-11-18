import type { FirstRunRoute } from '../first-run/routes';
import { isFirstRunRoute } from '../first-run/routes';
import {
  type DesignCaptureCustomiseScenario,
  type DesignCaptureFightViewMode,
  type DesignCapturePoseCompare,
  type DesignCaptureRankingScenario,
  type DesignCaptureSessionFailure,
  parseDesignCaptureCustomiseScenario,
  parseDesignCaptureFightView,
  parseDesignCapturePoseCompare,
  parseDesignCaptureRankingScenario,
  parseDesignCaptureSessionFailure,
} from './captureEnv';

/**
 * Pure in-memory capture intent state (no react-native).
 * RN wiring lives in pendingCaptureIntent.ts.
 */

export type CaptureIntent = {
  route: FirstRunRoute | null;
  paintId: string | null;
  weaponId: string | null;
  mute: boolean | null;
  /** Live-fight battle id for FightResult restore after iOS process relaunch. */
  battleId: string | null;
  /** C5 ranking capture scenario (live / empty / error / offline / auth_expired). */
  rankingScenario: DesignCaptureRankingScenario | null;
  /** C8: force PlayableMisconfiguredScreen for blocked-UI evidence. */
  failClosed: boolean | null;
  /** C11: dual-fighter quick vs heavy pose stills (design-capture only). */
  poseCompare: DesignCapturePoseCompare | null;
  /** C10: force offline / auth-expired banners on first-run screens. */
  sessionFailure: DesignCaptureSessionFailure | null;
  /** D1: force Fight View firstWatch / rewatch control set for capture stills. */
  fightViewMode: DesignCaptureFightViewMode | null;
  /** D3: Customise paint-clean / paint-dirty / equipped / weapon-soon stills. */
  customiseScenario: DesignCaptureCustomiseScenario | null;
};

const EMPTY: CaptureIntent = {
  route: null,
  paintId: null,
  weaponId: null,
  mute: null,
  battleId: null,
  rankingScenario: null,
  failClosed: null,
  poseCompare: null,
  sessionFailure: null,
  fightViewMode: null,
  customiseScenario: null,
};

let intent: CaptureIntent = { ...EMPTY };

export function peekCaptureIntent(): CaptureIntent {
  return { ...intent };
}

export function mergeIntent(next: Partial<CaptureIntent>): void {
  intent = {
    route: next.route ?? intent.route,
    paintId: next.paintId ?? intent.paintId,
    weaponId: next.weaponId ?? intent.weaponId,
    mute: next.mute ?? intent.mute,
    battleId: next.battleId ?? intent.battleId,
    rankingScenario: next.rankingScenario ?? intent.rankingScenario,
    failClosed: next.failClosed ?? intent.failClosed,
    poseCompare: next.poseCompare ?? intent.poseCompare,
    // null must clear — sequential capture stills replace the prior override.
    // Omit (undefined) keeps the previous value for unrelated file merges.
    sessionFailure: next.sessionFailure === undefined ? intent.sessionFailure : next.sessionFailure,
    fightViewMode: next.fightViewMode === undefined ? intent.fightViewMode : next.fightViewMode,
    customiseScenario:
      next.customiseScenario === undefined ? intent.customiseScenario : next.customiseScenario,
  };
}

/** Merge a Documents-file override written by CI (`botore-design-capture-intent.json`). */
export function mergeCaptureFileIntent(raw: {
  route?: string | null;
  paintId?: string | null;
  weaponId?: string | null;
  mute?: boolean | null;
  battleId?: string | null;
  rankingScenario?: string | null;
  ranking?: string | null;
  failClosed?: boolean | null;
  poseCompare?: string | null;
  sessionFailure?: string | null;
  fightViewMode?: string | null;
  fightView?: string | null;
  customiseScenario?: string | null;
  customise?: string | null;
}): void {
  const route = typeof raw.route === 'string' && isFirstRunRoute(raw.route) ? raw.route : null;
  mergeIntent({
    route,
    paintId: typeof raw.paintId === 'string' && raw.paintId.trim() ? raw.paintId.trim() : null,
    weaponId: typeof raw.weaponId === 'string' && raw.weaponId.trim() ? raw.weaponId.trim() : null,
    mute: typeof raw.mute === 'boolean' ? raw.mute : null,
    battleId: typeof raw.battleId === 'string' && raw.battleId.trim() ? raw.battleId.trim() : null,
    rankingScenario: parseDesignCaptureRankingScenario(
      raw.rankingScenario ?? raw.ranking ?? undefined,
    ),
    failClosed: typeof raw.failClosed === 'boolean' ? raw.failClosed : null,
    poseCompare: parseDesignCapturePoseCompare(raw.poseCompare),
    // Only touch sessionFailure when the file names it — omit keeps prior override.
    ...(raw.sessionFailure !== undefined
      ? { sessionFailure: parseDesignCaptureSessionFailure(raw.sessionFailure) }
      : {}),
    ...(raw.fightViewMode !== undefined || raw.fightView !== undefined
      ? {
          fightViewMode: parseDesignCaptureFightView(
            raw.fightViewMode ?? raw.fightView ?? undefined,
          ),
        }
      : {}),
    ...(raw.customiseScenario !== undefined || raw.customise !== undefined
      ? {
          customiseScenario: parseDesignCaptureCustomiseScenario(
            raw.customiseScenario ?? raw.customise ?? undefined,
          ),
        }
      : {}),
  });
}

/** Snapshot + clear route so the next cold start does not reuse it. */
export function consumeCaptureRoute(): FirstRunRoute | null {
  const route = intent.route;
  intent = { ...intent, route: null };
  return route;
}

/** Test-only reset. */
export function resetCaptureIntentForTests(): void {
  intent = { ...EMPTY };
}
