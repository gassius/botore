import { FIRST_RUN_ROUTES, isFirstRunRoute, type FirstRunRoute } from '../first-run/routes';

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

/** Ranking capture override for empty/error stills (C5). */
export type DesignCaptureRankingScenario = 'live' | 'empty' | 'error';

export type DesignCaptureConfig = {
  readonly enabled: boolean;
  /** Initial first-run route when capture mode boots. */
  readonly initialRoute: FirstRunRoute | null;
  /** Optional demo paint id when capture mode boots (e.g. petrol). */
  readonly initialPaintId: string | null;
  /** Optional demo weapon id when capture mode boots (e.g. axe). */
  readonly initialWeaponId: string | null;
};

export function parseDesignCaptureRankingScenario(
  raw: string | null | undefined,
): DesignCaptureRankingScenario | null {
  const v = trimPublic(raw ?? undefined)?.toLowerCase();
  if (v === 'live' || v === 'empty' || v === 'error') return v;
  return null;
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
export function parseDesignCaptureUrl(url: string): {
  route: FirstRunRoute | null;
  mute: boolean | null;
  paintId: string | null;
  weaponId: string | null;
  rankingScenario: DesignCaptureRankingScenario | null;
} {
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith(`${DESIGN_CAPTURE_SCHEME}:`)) {
    return {
      route: null,
      mute: null,
      paintId: null,
      weaponId: null,
      rankingScenario: null,
    };
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
    return {
      route: null,
      mute: null,
      paintId: null,
      weaponId: null,
      rankingScenario: null,
    };
  }

  const params = new URLSearchParams(queryPart);
  const pathRoute = segments[1];
  const queryRoute = params.get('route');
  const candidate = pathRoute ?? queryRoute;
  const route = candidate && isFirstRunRoute(candidate) ? candidate : null;

  const muteRaw = params.get('mute');
  let mute: boolean | null = null;
  if (muteRaw !== null) {
    const v = muteRaw.toLowerCase();
    mute = v === '1' || v === 'true' || v === 'yes';
  }

  const paintId = trimPublic(params.get('paint') ?? undefined) ?? null;
  const weaponId = trimPublic(params.get('weapon') ?? undefined) ?? null;
  const rankingScenario = parseDesignCaptureRankingScenario(
    params.get('ranking') ?? params.get('rankingScenario'),
  );

  return { route, mute, paintId, weaponId, rankingScenario };
}

export function buildDesignCaptureUrl(
  route: FirstRunRoute,
  opts?: {
    mute?: boolean;
    paintId?: string;
    weaponId?: string;
    rankingScenario?: DesignCaptureRankingScenario;
  },
): string {
  const query: string[] = [];
  if (opts?.mute === true) query.push('mute=1');
  if (opts?.paintId) query.push(`paint=${encodeURIComponent(opts.paintId)}`);
  if (opts?.weaponId) query.push(`weapon=${encodeURIComponent(opts.weaponId)}`);
  if (opts?.rankingScenario) {
    query.push(`ranking=${encodeURIComponent(opts.rankingScenario)}`);
  }
  const q = query.length > 0 ? `?${query.join('&')}` : '';
  return `${DESIGN_CAPTURE_SCHEME}://${DESIGN_CAPTURE_HOST}/${route}${q}`;
}

export function listCaptureRoutes(): readonly FirstRunRoute[] {
  return FIRST_RUN_ROUTES;
}
