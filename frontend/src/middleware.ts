import { NextRequest, NextResponse } from 'next/server'
import { getRedirectUrl } from '@/lib/auth-guard'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('auth-token')?.value
  const role = request.cookies.get('auth-role')?.value

  const redirectTo = getRedirectUrl(pathname, token, role)
  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/upload/:path*', '/profile/:path*', '/admin/:path*'],
}
