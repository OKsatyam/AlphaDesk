import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  // Redirect authenticated users away from landing / auth pages
  if (token && (pathname === '/' || pathname === '/auth' || pathname === '/onboarding')) {
    return NextResponse.redirect(new URL('/chat', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/auth', '/onboarding'],
};
