const PLACEHOLDERS = new Set([
  'replace-with-strong-secret',
  'changeme',
  'secret',
  'dev',
  'development',
]);

export function assertSecretStrength(name: string, value: string | undefined): void {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 chars`);
  }

  if (PLACEHOLDERS.has(value.toLowerCase())) {
    throw new Error(`${name} is a placeholder; set a real value`);
  }
}
