export function parseAllowedCorsOrigins(rawValue: string | undefined = process.env.CORS_ORIGIN): string[] {
  return (rawValue ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw new Error(`Invalid CORS origin "${origin}": expected protocol://host:port`);
      }

      if (!url.protocol || !url.hostname) {
        throw new Error(`Invalid CORS origin "${origin}": protocol and hostname are required`);
      }

      if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
        throw new Error(`Invalid CORS origin "${origin}": must only contain protocol, hostname, and optional port`);
      }

      return url.origin;
    });
}

export function assertCorsConfigInProduction(
  allowedOrigins: string[],
  isProduction: boolean,
): void {
  if (isProduction && allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must be explicitly configured in production');
  }
}

export function createCorsOriginDelegate(
  allowedOrigins: string[],
): (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void {
  const allowedOriginSet = new Set(allowedOrigins);
  const isConfigured = allowedOriginSet.size > 0;

  return (origin, callback): void => {
    if (!isConfigured) {
      callback(new Error('CORS is not configured'));
      return;
    }

    if (!origin) {
      callback(new Error('CORS origin is required'));
      return;
    }

    if (!allowedOriginSet.has(origin)) {
      callback(new Error(`CORS origin "${origin}" is not allowed`));
      return;
    }

    callback(null, true);
  };
}
