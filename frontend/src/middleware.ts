import { NextRequest, NextResponse } from 'next/server'

// Routes that require a logged-in user
const AUTH_REQUIRED = ['/upload', '/profile', '/admin']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('auth-token')?.value

  const needsAuth = AUTH_REQUIRED.some((p) => pathname.startsWith(p))

  if (needsAuth && !token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/upload/:path*', '/profile/:path*', '/admin/:path*'],
}
