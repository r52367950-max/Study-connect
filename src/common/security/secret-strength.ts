const MIN_SECRET_LENGTH = 32;
/**
 * Minimum number of distinct characters. A 32-character secret made of one
 * repeated character has essentially no entropy yet satisfied the length rule, so
 * JWT_SECRET set to 32 a's booted as though it were strong.
 */
const MIN_DISTINCT_CHARS = 8;

/**
 * Markers that a secret was never really set. Matched as substrings: as exact
 * matches these were unreachable, because every entry is shorter than
 * MIN_SECRET_LENGTH and therefore failed the length check first. Padding a
 * placeholder out to 32 characters is now rejected too.
 */
const PLACEHOLDERS = [
  'replace-with-strong-secret',
  'changeme',
  'change-me',
  'placeholder',
  'your-secret',
  'insecure',
  'password',
  'secret-key',
];

export function assertSecretStrength(name: string, value: string | undefined): void {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} chars`);
  }

  const lowered = value.toLowerCase();
  const placeholder = PLACEHOLDERS.find((candidate) => lowered.includes(candidate));
  if (placeholder) {
    throw new Error(`${name} contains the placeholder "${placeholder}"; set a real value`);
  }

  if (new Set(value).size < MIN_DISTINCT_CHARS) {
    throw new Error(
      `${name} is too repetitive; use at least ${MIN_DISTINCT_CHARS} distinct characters ` +
        '(generate one with `openssl rand -hex 32`)',
    );
  }
}
