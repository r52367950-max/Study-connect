/**
 * auth-guard.ts
 *
 * Pure guard logic extracted from middleware so it can be
 * unit-tested without a Next.js edge runtime.
 */

const AUTH_REQUIRED = ['/upload', '/profile', '/admin', '/onboarding']

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
 * @param token - Value of the `auth-token` HttpOnly cookie (undefined = not set)
 */
export function getRedirectUrl(
  pathname: string,
  token: string | undefined,
): string | null {
  // 1. Unauthenticated → send to login
  if (requiresAuth(pathname) && !token) {
    return `/login?redirect=${encodeURIComponent(pathname)}`
  }

  return null
}
