/**
 * Public privacy + account-deletion URL paths (R6 / R5).
 *
 * Absolute host is owned by Carlos (custom domain on `botore-game` or another
 * SSO-free origin). Until then document the stable paths for store materials.
 */

/** Public privacy policy path on the game web export. */
export const PUBLIC_PRIVACY_PATH = '/privacy';

/**
 * Public account-deletion path shipped by R5 (#55).
 * R6 references this path in disclosure copy; it does not implement deletion.
 */
export const DOCUMENTED_ACCOUNT_DELETE_PATH = '/account/delete';

function readBrowserPathname(): string | null {
  const loc = (globalThis as { location?: { pathname?: string } }).location;
  return typeof loc?.pathname === 'string' ? loc.pathname : null;
}

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/** True when the browser is on the public privacy policy URL. */
export function isPublicPrivacyPath(
  pathname: string | null | undefined = readBrowserPathname(),
): boolean {
  if (!pathname) return false;
  return normalizePathname(pathname) === PUBLIC_PRIVACY_PATH;
}

/**
 * Optional absolute origin for store / in-app deep links
 * (`EXPO_PUBLIC_PUBLIC_WEB_ORIGIN`, no trailing slash).
 */
export function readPublicWebOrigin(): string | null {
  const raw = process.env.EXPO_PUBLIC_PUBLIC_WEB_ORIGIN?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

/** Build an absolute public URL when an origin is known; otherwise return the path. */
export function publicWebHref(path: string): string {
  const origin = readPublicWebOrigin();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (origin) return `${origin}${normalized}`;
  if (typeof globalThis !== 'undefined') {
    const loc = (globalThis as { location?: { origin?: string } }).location;
    if (typeof loc?.origin === 'string' && loc.origin.length > 0) {
      return `${loc.origin}${normalized}`;
    }
  }
  return normalized;
}
