import { FIRST_RUN_ROUTES, isFirstRunRoute, type FirstRunRoute } from '../first-run/routes';
import {
  parseResultCaptureScenario,
  type ResultCaptureScenario,
} from '../result-overlay/designCaptureRecords';

/**
 * Design-capture helpers for native phone screenshots/clips (C7).
 * Opt-in only via Expo public env — never enable in production store builds.
 *
 * Expo inlines only static `process.env.EXPO_PUBLIC_*` member expressions.
 * Do not alias `process.env` or index it dynamically.
 */

export const DESIGN_CAPTURE_SCHEME = 'botore';
export const DESIGN_CAPTURE_HOST = 'capture';

export const DESIGN_CAPTURE_DEV_EMAIL = 'capture@botore.local';
export const DESIGN_CAPTURE_DEV_PASSWORD = 'design-capture';

/**
 * Live first-run fight capture (C3) — seed player repaired by CI
 * (`scripts/native-capture/prepare-live-fight-backend.mjs`) to a GoTrue-safe mailbox.
 */
export const LIVE_FIGHT_CAPTURE_EMAIL = 'dev-player@example.com';
export const LIVE_FIGHT_CAPTURE_PASSWORD = 'local-only-password';

/**
 * Ranking capture override (C5/C10/D4).
 * - live: prefer E2 RPCs when authed
 * - bots / botores: DEV fixtures with portraits/emblems + W–L on that tab
 * - empty / loading / error / offline / auth_expired: forced UI states
 */
export type DesignCaptureRankingScenario =
  'live' | 'bots' | 'botores' | 'empty' | 'loading' | 'error' | 'offline' | 'auth_expired';

/** C10: force shared offline / auth-expired banners under design-capture. */
export type DesignCaptureSessionFailure = 'offline' | 'auth_expired';

/**
 * D3 / E7 Customise capture stills (native design review).
 * - paint-clean: Paint tab, confirmed loadout, DISCARD+EQUIP (no Oxide dot)
 * - paint-dirty: Paint tab, non-current paint selected, Oxide unsaved dot on EQUIP
 * - equipped: Paint tab right after successful EQUIP (button reads Equipped)
 * - weapon-soon: Weapon tab (legacy name; first stop — sword/axe/dagger)
 * - paint-hazard: Paint tab with hazard selected — PATTERN tile + robot pattern fill
 * - weapon-unlocked: Weapon tab last snap stop — mace/hammer/spear/shield unlocked
 */
export type DesignCaptureCustomiseScenario =
  'paint-clean' | 'paint-dirty' | 'equipped' | 'weapon-soon' | 'paint-hazard' | 'weapon-unlocked';

/** E5/D5: Ludus home capture stills (More sheet open). */
export type DesignCaptureHomeScenario = 'more';

/**
 * E3 fight-quota capture stills (Opponents + Confirm).
 * - remaining: fightsRemaining > 0
 * - exhausted: fightsRemaining = 0 (countdown hero)
 */
export type DesignCaptureFightQuotaScenario = 'remaining' | 'exhausted';

/**
 * Design-capture pose stills:
 * - `quick-vs-heavy` — dual-fighter quick vs heavy (C11)
 * - `clip-attack` / `clip-knockout` — kit clip frames for the deep-link weapon (A2b)
 */
export type DesignCapturePoseCompare = 'quick-vs-heavy' | 'clip-attack' | 'clip-knockout';

export type DesignCaptureConfig = {
  readonly enabled: boolean;
  /** Initial first-run route when capture mode boots. */
  readonly initialRoute: FirstRunRoute | null;
  /** Optional demo paint id when capture mode boots (e.g. petrol). */
  readonly initialPaintId: string | null;
  /** Optional demo weapon id when capture mode boots (e.g. axe). */
  readonly initialWeaponId: string | null;
};

export function parseDesignCapturePoseCompare(
  raw: string | null | undefined,
): DesignCapturePoseCompare | null {
  const v = trimPublic(raw ?? undefined)?.toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'quick-vs-heavy') {
    return 'quick-vs-heavy';
  }
  if (v === 'clip-attack' || v === 'clip_attack') return 'clip-attack';
  if (v === 'clip-knockout' || v === 'clip_knockout') return 'clip-knockout';
  return null;
}

/**
 * True when design-capture boots with pose-compare stills
 * (`EXPO_PUBLIC_DESIGN_CAPTURE_POSE_COMPARE=1`).
 */
export function readDesignCapturePoseCompare(
  flag: string | undefined = process.env.EXPO_PUBLIC_DESIGN_CAPTURE_POSE_COMPARE,
): DesignCapturePoseCompare | null {
  if (!isDesignCaptureEnabled()) return null;
  return parseDesignCapturePoseCompare(flag);
}

export function parseDesignCaptureRankingScenario(
  raw: string | null | undefined,
): DesignCaptureRankingScenario | null {
  const v = trimPublic(raw ?? undefined)?.toLowerCase();
  if (v === 'live') return 'live';
  if (v === 'bots' || v === 'bot') return 'bots';
  if (v === 'botores' || v === 'botore') return 'botores';
  if (v === 'empty') return 'empty';
  if (v === 'loading' || v === 'load') return 'loading';
  if (v === 'error') return 'error';
  if (v === 'offline') return 'offline';
  if (v === 'auth_expired') return 'auth_expired';
  return null;
}

/** Initial Ranking tab for a design-capture scenario (default bots). */
export function rankingTabForCaptureScenario(
  scenario: DesignCaptureRankingScenario | null | undefined,
): 'bots' | 'botores' {
  return scenario === 'botores' ? 'botores' : 'bots';
}

/** True when capture must force DEV ranking fixtures (not live RPCs). */
export function isFixtureRankingCaptureScenario(
  scenario: DesignCaptureRankingScenario | null | undefined,
): boolean {
  return (
    scenario === 'bots' ||
    scenario === 'botores' ||
    scenario === 'empty' ||
    scenario === 'loading' ||
    scenario === 'error' ||
    scenario === 'offline' ||
    scenario === 'auth_expired'
  );
}

export function parseDesignCaptureSessionFailure(
  raw: string | null | undefined,
): DesignCaptureSessionFailure | null {
  const v = trimPublic(raw ?? undefined)?.toLowerCase();
  if (v === 'offline' || v === 'auth_expired') return v;
  return null;
}

export function parseDesignCaptureCustomiseScenario(
  raw: string | null | undefined,
): DesignCaptureCustomiseScenario | null {
  const v = trimPublic(raw ?? undefined)?.toLowerCase();
  if (v === 'paint-clean' || v === 'paint_clean' || v === 'clean') return 'paint-clean';
  if (v === 'paint-dirty' || v === 'paint_dirty' || v === 'dirty') return 'paint-dirty';
  if (v === 'equipped' || v === 'equip') return 'equipped';
  if (v === 'weapon-soon' || v === 'weapon_soon' || v === 'weapon') return 'weapon-soon';
  if (v === 'paint-hazard' || v === 'paint_hazard' || v === 'hazard') return 'paint-hazard';
  if (
    v === 'weapon-unlocked' ||
    v === 'weapon_unlocked' ||
    v === 'weapons-unlocked' ||
    v === 'weapon-last'
  ) {
    return 'weapon-unlocked';
  }
  return null;
}

export function parseDesignCaptureHomeScenario(
  raw: string | null | undefined,
): DesignCaptureHomeScenario | null {
  const v = trimPublic(raw ?? undefined)?.toLowerCase();
  if (v === 'more') return 'more';
  return null;
}

export function parseDesignCaptureFightQuotaScenario(
  raw: string | null | undefined,
): DesignCaptureFightQuotaScenario | null {
  const v = trimPublic(raw ?? undefined)?.toLowerCase();
  if (v === 'remaining' || v === 'full' || v === 'gt0' || v === '>0') return 'remaining';
  if (v === 'exhausted' || v === 'empty' || v === 'zero' || v === '0') return 'exhausted';
  return null;
}

/**
 * True when design-capture boots with a forced session-failure banner
 * (`EXPO_PUBLIC_DESIGN_CAPTURE_SESSION_FAILURE=offline|auth_expired`).
 */
export function readDesignCaptureSessionFailure(
  flag: string | undefined = process.env.EXPO_PUBLIC_DESIGN_CAPTURE_SESSION_FAILURE,
): DesignCaptureSessionFailure | null {
  if (!isDesignCaptureEnabled()) return null;
  return parseDesignCaptureSessionFailure(flag);
}

function trimPublic(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function truthyFlag(raw: string | undefined): boolean {
  const v = trimPublic(raw)?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** True when `EXPO_PUBLIC_DESIGN_CAPTURE=1` (or `true`). */
export function isDesignCaptureEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_DESIGN_CAPTURE,
): boolean {
  return truthyFlag(flag);
}

/**
 * True when design-capture + live fight path are enabled.
 * Requires baked `EXPO_PUBLIC_SUPABASE_*` so adapters hit combat-v1 (not DEV scaffold).
 */
export function isLiveFightCaptureEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_DESIGN_CAPTURE_LIVE_FIGHT,
): boolean {
  return isDesignCaptureEnabled() && truthyFlag(flag);
}

/**
 * C8 evidence: force fail-closed blocked UI under design-capture.
 * Never bake into preview/production store profiles.
 */
export function isDesignCaptureFailClosedEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED,
): boolean {
  return isDesignCaptureEnabled() && truthyFlag(flag);
}

/** Credentials used by capture auto sign-in. */
export function designCaptureCredentials(): { email: string; password: string } {
  if (isLiveFightCaptureEnabled()) {
    return { email: LIVE_FIGHT_CAPTURE_EMAIL, password: LIVE_FIGHT_CAPTURE_PASSWORD };
  }
  return { email: DESIGN_CAPTURE_DEV_EMAIL, password: DESIGN_CAPTURE_DEV_PASSWORD };
}

export function readDesignCaptureInitialRoute(
  route: string | undefined = process.env.EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE,
): FirstRunRoute | null {
  const raw = trimPublic(route);
  if (!raw) return null;
  return isFirstRunRoute(raw) ? raw : null;
}

export function readDesignCaptureInitialPaint(
  paint: string | undefined = process.env.EXPO_PUBLIC_DESIGN_CAPTURE_PAINT,
): string | null {
  return trimPublic(paint) ?? null;
}

export function readDesignCaptureInitialWeapon(
  weapon: string | undefined = process.env.EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON,
): string | null {
  return trimPublic(weapon) ?? null;
}

export function readDesignCaptureConfig(opts?: {
  flag?: string | undefined;
  route?: string | undefined;
  paint?: string | undefined;
  weapon?: string | undefined;
}): DesignCaptureConfig {
  const enabled = isDesignCaptureEnabled(opts?.flag);
  return {
    enabled,
    initialRoute: enabled ? readDesignCaptureInitialRoute(opts?.route) : null,
    initialPaintId: enabled ? readDesignCaptureInitialPaint(opts?.paint) : null,
    initialWeaponId: enabled ? readDesignCaptureInitialWeapon(opts?.weapon) : null,
  };
}

/**
 * Parse capture deep links produced by the native-capture scripts:
 * - `botore://capture/Replay`
 * - `botore://capture?route=Replay`
 * - `botore://capture/Replay?mute=1`
 * - `botore://capture/Stable?paint=petrol&weapon=axe`
 *
 * Custom-scheme URL parsing differs across RN / JS engines; normalize first.
 */
export type DesignCaptureFightViewMode = 'firstWatch' | 'rewatch';

export function parseDesignCaptureFightView(
  raw: string | null | undefined,
): DesignCaptureFightViewMode | null {
  if (raw == null) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'rewatch' || v === 're-watch') return 'rewatch';
  if (v === 'firstwatch' || v === 'first_watch' || v === 'first-watch') return 'firstWatch';
  return null;
}

const EMPTY_CAPTURE_URL = {
  route: null,
  mute: null,
  paintId: null,
  weaponId: null,
  rankingScenario: null,
  failClosed: null,
  poseCompare: null,
  sessionFailure: null,
  fightViewMode: null,
  customiseScenario: null,
  resultScenario: null,
  homeScenario: null,
  fightQuotaScenario: null,
} as const;

export function parseDesignCaptureUrl(url: string): {
  route: FirstRunRoute | null;
  mute: boolean | null;
  paintId: string | null;
  weaponId: string | null;
  rankingScenario: DesignCaptureRankingScenario | null;
  failClosed: boolean | null;
  poseCompare: DesignCapturePoseCompare | null;
  sessionFailure: DesignCaptureSessionFailure | null;
  fightViewMode: DesignCaptureFightViewMode | null;
  customiseScenario: DesignCaptureCustomiseScenario | null;
  resultScenario: ResultCaptureScenario | null;
  homeScenario: DesignCaptureHomeScenario | null;
  fightQuotaScenario: DesignCaptureFightQuotaScenario | null;
} {
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith(`${DESIGN_CAPTURE_SCHEME}:`)) {
    return { ...EMPTY_CAPTURE_URL };
  }

  // Normalize `botore://capture/Replay?mute=1` → path + query without scheme.
  const withoutScheme = trimmed.slice(`${DESIGN_CAPTURE_SCHEME}:`.length).replace(/^\/\//, '');
  const qIndex = withoutScheme.indexOf('?');
  const pathPart = qIndex >= 0 ? withoutScheme.slice(0, qIndex) : withoutScheme;
  const queryPart = qIndex >= 0 ? withoutScheme.slice(qIndex + 1) : '';

  const segments = pathPart
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments[0] !== DESIGN_CAPTURE_HOST) {
    return { ...EMPTY_CAPTURE_URL };
  }

  const params = new URLSearchParams(queryPart);
  const pathRoute = segments[1];
  const queryRoute = params.get('route');
  const candidate = pathRoute ?? queryRoute;
  const route = candidate && isFirstRunRoute(candidate) ? candidate : null;
  const poseCompare = parseDesignCapturePoseCompare(
    params.get('poseCompare') ?? params.get('pose_compare'),
  );

  const muteRaw = params.get('mute');
  let mute: boolean | null = null;
  if (muteRaw !== null) {
    const v = muteRaw.toLowerCase();
    mute = v === '1' || v === 'true' || v === 'yes';
  }

  const failClosedRaw = params.get('failClosed') ?? params.get('fail_closed');
  let failClosed: boolean | null = null;
  if (failClosedRaw !== null) {
    const v = failClosedRaw.toLowerCase();
    failClosed = v === '1' || v === 'true' || v === 'yes';
  }

  const paintId = trimPublic(params.get('paint') ?? undefined) ?? null;
  const weaponId = trimPublic(params.get('weapon') ?? undefined) ?? null;
  const rankingScenario = parseDesignCaptureRankingScenario(
    params.get('ranking') ?? params.get('rankingScenario'),
  );
  const sessionFailure = parseDesignCaptureSessionFailure(
    params.get('sessionFailure') ?? params.get('session_failure'),
  );
  const fightViewMode = parseDesignCaptureFightView(
    params.get('fightView') ?? params.get('fight_view') ?? params.get('fightViewMode'),
  );
  const customiseScenario = parseDesignCaptureCustomiseScenario(
    params.get('customise') ?? params.get('customiseScenario') ?? params.get('customise_scenario'),
  );
  const resultScenario = parseResultCaptureScenario(
    params.get('result') ?? params.get('resultScenario') ?? params.get('result_scenario'),
  );
  const homeScenario = parseDesignCaptureHomeScenario(
    params.get('home') ?? params.get('homeScenario') ?? params.get('home_scenario'),
  );
  const fightQuotaScenario = parseDesignCaptureFightQuotaScenario(
    params.get('fightQuota') ?? params.get('fight_quota') ?? params.get('quota'),
  );

  return {
    route,
    mute,
    paintId,
    weaponId,
    rankingScenario,
    failClosed,
    poseCompare,
    sessionFailure,
    fightViewMode,
    customiseScenario,
    resultScenario,
    homeScenario,
    fightQuotaScenario,
  };
}

export function buildDesignCaptureUrl(
  route: FirstRunRoute,
  opts?: {
    mute?: boolean;
    paintId?: string;
    weaponId?: string;
    rankingScenario?: DesignCaptureRankingScenario;
    failClosed?: boolean;
    poseCompare?: DesignCapturePoseCompare;
    sessionFailure?: DesignCaptureSessionFailure;
    fightViewMode?: DesignCaptureFightViewMode;
    customiseScenario?: DesignCaptureCustomiseScenario;
    resultScenario?: ResultCaptureScenario;
    homeScenario?: DesignCaptureHomeScenario;
    fightQuotaScenario?: DesignCaptureFightQuotaScenario;
  },
): string {
  const query: string[] = [];
  if (opts?.mute === true) query.push('mute=1');
  if (opts?.paintId) query.push(`paint=${encodeURIComponent(opts.paintId)}`);
  if (opts?.weaponId) query.push(`weapon=${encodeURIComponent(opts.weaponId)}`);
  if (opts?.rankingScenario) {
    query.push(`ranking=${encodeURIComponent(opts.rankingScenario)}`);
  }
  if (opts?.failClosed === true) query.push('failClosed=1');
  if (opts?.poseCompare) query.push(`poseCompare=${encodeURIComponent(opts.poseCompare)}`);
  if (opts?.sessionFailure) {
    query.push(`sessionFailure=${encodeURIComponent(opts.sessionFailure)}`);
  }
  if (opts?.fightViewMode) {
    query.push(`fightView=${encodeURIComponent(opts.fightViewMode)}`);
  }
  if (opts?.customiseScenario) {
    query.push(`customise=${encodeURIComponent(opts.customiseScenario)}`);
  }
  if (opts?.resultScenario) {
    query.push(`result=${encodeURIComponent(opts.resultScenario)}`);
  }
  if (opts?.homeScenario) {
    query.push(`home=${encodeURIComponent(opts.homeScenario)}`);
  }
  if (opts?.fightQuotaScenario) {
    query.push(`fightQuota=${encodeURIComponent(opts.fightQuotaScenario)}`);
  }
  const q = query.length > 0 ? `?${query.join('&')}` : '';
  return `${DESIGN_CAPTURE_SCHEME}://${DESIGN_CAPTURE_HOST}/${route}${q}`;
}

export function listCaptureRoutes(): readonly FirstRunRoute[] {
  return FIRST_RUN_ROUTES;
}
