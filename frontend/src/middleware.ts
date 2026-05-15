import { NextRequest, NextResponse } from 'next/server'
import { getRedirectUrl } from '@/lib/auth-guard'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('auth-token')?.value

  const redirectTo = getRedirectUrl(pathname, token)
  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/upload',
    '/upload/:path*',
    '/profile',
    '/profile/:path*',
    '/admin',
    '/admin/:path*',
    '/onboarding',
    '/onboarding/:path*',
  ],
}
