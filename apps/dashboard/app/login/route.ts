import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_COOKIE = 'botore_dash';

/**
 * Development-only login: compares the posted token against
 * DASHBOARD_AUTH_TOKEN and sets the auth cookie. Fails closed outside dev.
 */
export async function POST(req: Request) {
  const env = process.env['BOTORE_ENV'] ?? 'development';
  const token = process.env['DASHBOARD_AUTH_TOKEN'];
  if (env !== 'development' || !token) {
    return new NextResponse('disabled', { status: 403 });
  }
  const form = await req.formData();
  const supplied = String(form.get('token') ?? '');
  if (supplied !== token) {
    return new NextResponse('invalid token', { status: 401 });
  }
  const jar = cookies();
  jar.set(AUTH_COOKIE, token, { httpOnly: true, sameSite: 'strict' });
  return NextResponse.redirect(new URL('/', req.url));
}

export async function GET() {
  return new NextResponse(
    `<!doctype html><html><body style="background:#0b0f14;color:#e6edf3;font-family:system-ui;display:grid;place-items:center;height:100vh">
      <form method="post" style="display:grid;gap:8px;border:1px solid #1f2733;padding:24px;border-radius:8px">
        <label>dev auth token</label>
        <input name="token" type="password" autofocus />
        <button>sign in</button>
        <small style="color:#8b98ab">local development shortcut — fails closed elsewhere</small>
      </form></body></html>`,
    { headers: { 'content-type': 'text/html' } },
  );
}
