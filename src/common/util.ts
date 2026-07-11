/**
 * Strip spaces and dashes from a raw phone string, leaving an optional leading
 * `+` and digits. The DTO regex (`^[+\d][\d\s-]{6,19}$`) restricts input to
 * those characters; after normalization the result is the form used as a
 * primary key / lookup value, so two equivalent inputs ("+86 138-0000-0000"
 * and "+8613800000000") collapse to the same value.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/**
 * decodeURIComponent throws URIError on malformed sequences ("%E0%A4%A"), which
 * would surface as an uncaught 500 from cookie / header parsers. Wrap it so
 * callers can treat a malformed value as "cookie not present" (return '').
 */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    if (err instanceof URIError) {
      return '';
    }
    throw err;
  }
}

/**
 * Extract a cookie value from a raw `Cookie` header. Shared by the auth
 * controller, JWT guard and CSRF service so all three parse cookies the same
 * way: entries are split on `;` and trimmed, only the first `=` separates
 * name from value (the rest is joined back), and the scan stops at the first
 * entry whose name matches and that actually has an `=`. A value that decodes
 * to the empty string (including malformed percent-encoding, see
 * safeDecodeURIComponent) is treated as "cookie not present" (null).
 */
export function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const entry of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = entry.trim().split('=');
    if (rawName === name && rawValue.length > 0) {
      const decoded = safeDecodeURIComponent(rawValue.join('='));
      return decoded === '' ? null : decoded;
    }
  }
  return null;
}
