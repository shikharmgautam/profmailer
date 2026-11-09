import { NextResponse } from 'next/server';

/**
 * Route protection proxy (Next.js 16+ — replaces middleware.js).
 * - /login and /api/auth/* are always public.
 * - All other routes require the prof_session cookie.
 * - If cookie is missing: browser pages → redirect /login; API routes → 401.
 */
export function proxy(request) {
  const { pathname } = request.nextUrl;

  // Always allow login page and auth API routes
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth/')
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('prof_session');

  if (!sessionCookie?.value) {
    // API routes: return 401 JSON (server-side route handlers will also enforce)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }
    // Page routes: redirect to /login with return path
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js internals and static assets.
     * This prevents blocking CSS/JS/images during page load.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

