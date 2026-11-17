import { NextResponse, type NextRequest } from 'next/server';

// Edge middleware only checks that a session cookie is present; the session itself
// is validated (and permissions enforced) in each page and API route.
const PUBLIC = [/^\/login\/?$/, /^\/forgot\/?$/, /^\/setup\/?$/, /^\/f\//, /^\/api\/auth\//, /^\/api\/health\/?$/, /^\/api\/uploads\/[^/]+$/];
const PUBLIC_SUBMIT = /^\/api\/forms\/[^/]+\/(submissions|files)\/?$/;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for state-changing API calls: the admin UI only ever calls the API from its own origin,
 * so a request a browser marks as coming from another site (or another origin on the same site) is refused.
 * Public form submissions and file uploads are exempt (forms are served on per-form ports / domains).
 */
function crossSiteWrite(req: NextRequest, pathname: string) {
  if (SAFE_METHODS.has(req.method) || !pathname.startsWith('/api/')) return false;
  if (req.method === 'POST' && PUBLIC_SUBMIT.test(pathname)) return false;
  const site = req.headers.get('sec-fetch-site');
  if (site) return site !== 'same-origin' && site !== 'none';
  // Older browsers without Fetch Metadata: compare Origin (when sent) with the host that was asked for.
  const origin = req.headers.get('origin');
  if (!origin || origin === 'null') return !!origin;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return true;
  }
  const hosts = [req.headers.get('host'), ...(req.headers.get('x-forwarded-host') ?? '').split(',')].map((h) => (h ?? '').trim().toLowerCase()).filter(Boolean);
  return !hosts.includes(host);
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (crossSiteWrite(req, pathname)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  // Tell the server which path is being served (always overwritten, so a client can't spoof it).
  // getCurrentUser() uses it to keep users who must set up two-factor sign-in on their profile.
  const headers = new Headers(req.headers);
  headers.set('x-fc-path', pathname);
  const pass = () => NextResponse.next({ request: { headers } });
  if (PUBLIC.some((r) => r.test(pathname))) return pass();
  if (req.method === 'POST' && PUBLIC_SUBMIT.test(pathname)) return pass();
  if (req.cookies.has('fc_session')) return pass();

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg).*)'],
};
