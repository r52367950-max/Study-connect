/**
 * Shared resolution of auth/CSRF cookie flags. Pure functions over the raw
 * setting value so each caller can source it however it already does
 * (process.env in AuthController, ConfigService in CsrfService) without the
 * two copies drifting apart.
 */

/** `AUTH_COOKIE_SECURE`: only the exact string 'true' enables the Secure flag. */
export function resolveCookieSecure(raw: string | undefined): boolean {
  return raw === 'true';
}

/** `AUTH_COOKIE_SAMESITE`: 'strict' / 'none' (case-insensitive), anything else falls back to 'lax'. */
export function resolveCookieSameSite(raw: string | undefined): 'lax' | 'strict' | 'none' {
  const sameSite = (raw ?? 'lax').toLowerCase();
  if (sameSite === 'strict' || sameSite === 'none') {
    return sameSite;
  }
  return 'lax';
}
