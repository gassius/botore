import { PUBLIC_ACCOUNT_DELETE_PATH } from '../garage/auth/accountDeleteClient';

function readBrowserPathname(): string | null {
  const loc = (globalThis as { location?: { pathname?: string } }).location;
  return typeof loc?.pathname === 'string' ? loc.pathname : null;
}

/** True when the browser is on the public R5 deletion URL. */
export function isPublicAccountDeletePath(
  pathname: string | null | undefined = readBrowserPathname(),
): boolean {
  if (!pathname) return false;
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === PUBLIC_ACCOUNT_DELETE_PATH;
}
