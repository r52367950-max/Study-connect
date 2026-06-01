/**
 * Parse the `TRUST_PROXY` env var into an explicit decision.
 *
 * Express's `trust proxy` setting is security-sensitive: when enabled, the
 * `X-Forwarded-For` header is honored to derive the client IP (used for rate
 * limiting and login lockout). A naive `Boolean(process.env.TRUST_PROXY)` is
 * dangerous because `Boolean("0") === true` and `Boolean("false") === true`,
 * so values meant to DISABLE trust would silently ENABLE it.
 *
 * Accepted values:
 *  - unset / empty  -> disabled (do not trust XFF)
 *  - `"0"`          -> disabled (zero proxy hops)
 *  - positive int N -> trust N proxy hops
 *  - anything else  -> throw (reject boot rather than guess)
 */
export interface TrustProxySetting {
  enabled: boolean;
  hops: number;
}

export function parseTrustProxy(raw: string | undefined | null): TrustProxySetting {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return { enabled: false, hops: 0 };
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid TRUST_PROXY value: ${JSON.stringify(raw)}. ` +
        'Leave it unset to disable, or set a non-negative integer hop count.',
    );
  }

  const hops = Number(trimmed);
  return { enabled: hops > 0, hops };
}
