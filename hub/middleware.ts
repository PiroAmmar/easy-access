import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const { auth } = NextAuth(authConfig);

export default auth((req: NextRequest & { auth: unknown }) => {
  const isAuthenticated = !!req.auth;
  const pathname = req.nextUrl.pathname;
  const isLoginPage = pathname.startsWith('/login');

  // Public routes: NextAuth endpoints + health check (Railway pings it)
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/api/health')) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Redirect authenticated users away from login page
  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
