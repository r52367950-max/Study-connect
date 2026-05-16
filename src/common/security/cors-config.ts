export function normalizeOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid origin "${raw}": expected protocol://host:port`);
  }

  if (!url.protocol || !url.hostname) {
    throw new Error(`Invalid origin "${raw}": protocol and hostname are required`);
  }

  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`Invalid origin "${raw}": must only contain protocol, hostname, and optional port`);
  }

  return url.origin;
}

export function parseAllowedCorsOrigins(rawValue: string | undefined = process.env.CORS_ORIGIN): string[] {
  return (rawValue ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map(normalizeOrigin);
}

export function assertCorsConfigInProduction(
  allowedOrigins: string[],
  isProduction: boolean,
): void {
  if (!isProduction) {
    return;
  }

  if (allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must be explicitly configured in production');
  }

  if (process.env.AUTH_COOKIE_SECURE !== 'true') {
    throw new Error('AUTH_COOKIE_SECURE must be true in production');
  }

  for (const origin of allowedOrigins) {
    if (!origin.startsWith('https://')) {
      throw new Error(`CORS_ORIGIN must use https in production: ${origin}`);
    }
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
