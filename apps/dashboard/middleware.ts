/**
 * Development-only auth gate. FAILS CLOSED outside development.
 *
 * The dashboard is internal tooling; production auth (SSO/OIDC) is deferred
 * (ADR-0004). In development a shared secret cookie set via /login unlocks
 * read-only views. The middleware below rejects everything when:
 *  - BOTORE_ENV !== 'development', or
 *  - DASHBOARD_AUTH_TOKEN is unset, or
 *  - the cookie value doesn't match the token.
 */
import { NextResponse, type NextRequest } from 'next/server';

export const AUTH_COOKIE = 'botore_dash';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow the login page and its action.
  if (pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  const env = process.env['BOTORE_ENV'] ?? 'development';
  const token = process.env['DASHBOARD_AUTH_TOKEN'];
  if (env !== 'development' || !token) {
    return new NextResponse('Dashboard disabled: requires BOTORE_ENV=development', { status: 403 });
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie !== token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
