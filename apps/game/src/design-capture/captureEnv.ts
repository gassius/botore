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

export type DesignCaptureConfig = {
  readonly enabled: boolean;
  /** Initial first-run route when capture mode boots. */
  readonly initialRoute: FirstRunRoute | null;
};

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

export function readDesignCaptureInitialRoute(
  route: string | undefined = process.env.EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE,
): FirstRunRoute | null {
  const raw = trimPublic(route);
  if (!raw) return null;
  return isFirstRunRoute(raw) ? raw : null;
}

export function readDesignCaptureConfig(opts?: {
  flag?: string | undefined;
  route?: string | undefined;
}): DesignCaptureConfig {
  const enabled = isDesignCaptureEnabled(opts?.flag);
  return {
    enabled,
    initialRoute: enabled ? readDesignCaptureInitialRoute(opts?.route) : null,
  };
}

/**
 * Parse capture deep links produced by the native-capture scripts:
 * - `botore://capture/Replay`
 * - `botore://capture?route=Replay`
 * - `botore://capture/Replay?mute=1`
 *
 * Custom-scheme URL parsing differs across RN / JS engines; normalize first.
 */
export function parseDesignCaptureUrl(url: string): {
  route: FirstRunRoute | null;
  mute: boolean | null;
} {
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith(`${DESIGN_CAPTURE_SCHEME}:`)) {
    return { route: null, mute: null };
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
    return { route: null, mute: null };
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

  return { route, mute };
}

export function buildDesignCaptureUrl(route: FirstRunRoute, opts?: { mute?: boolean }): string {
  const mute = opts?.mute === true ? '?mute=1' : '';
  return `${DESIGN_CAPTURE_SCHEME}://${DESIGN_CAPTURE_HOST}/${route}${mute}`;
}

export function listCaptureRoutes(): readonly FirstRunRoute[] {
  return FIRST_RUN_ROUTES;
}
