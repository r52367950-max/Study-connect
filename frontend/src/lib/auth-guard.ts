/**
 * auth-guard.ts
 *
 * Pure guard logic extracted from middleware so it can be
 * unit-tested without a Next.js edge runtime.
 */

const AUTH_REQUIRED = ['/upload', '/profile', '/admin']

export function requiresAuth(pathname: string): boolean {
  return AUTH_REQUIRED.some((p) => pathname.startsWith(p))
}

export function requiresAdmin(pathname: string): boolean {
  return pathname.startsWith('/admin')
}

/**
 * Returns the redirect URL if access should be denied, or `null` if allowed.
 *
 * @param pathname - The requested pathname (e.g. `/admin`)
 * @param token    - Value of the `auth-token` cookie (undefined = not set)
 * @param role     - Value of the `auth-role` cookie   (undefined = not set)
 */
export function getRedirectUrl(
  pathname: string,
  token: string | undefined,
  role: string | undefined,
): string | null {
  // 1. Unauthenticated → send to login
  if (requiresAuth(pathname) && !token) {
    return `/login?redirect=${encodeURIComponent(pathname)}`
  }

  // 2. Authenticated but not ADMIN → send to materials with forbidden flag
  if (requiresAdmin(pathname) && role !== 'ADMIN') {
    return '/materials?forbidden=1'
  }

  return null
}
