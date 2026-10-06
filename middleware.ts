import { NextResponse, type NextRequest } from 'next/server';

// Edge middleware only checks that a session cookie is present; the session itself
// is validated (and permissions enforced) in each page and API route.
const PUBLIC = [/^\/login\/?$/, /^\/setup\/?$/, /^\/f\//, /^\/api\/auth\//, /^\/api\/health\/?$/, /^\/api\/uploads\/[^/]+$/];
const PUBLIC_SUBMIT = /^\/api\/forms\/[^/]+\/submissions\/?$/;

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (req.method === 'POST' && PUBLIC_SUBMIT.test(pathname)) return NextResponse.next();
  if (req.cookies.has('fc_session')) return NextResponse.next();

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg).*)'],
};
