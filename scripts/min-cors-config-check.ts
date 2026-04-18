import {
  assertCorsConfigInProduction,
  createCorsOriginDelegate,
  parseAllowedCorsOrigins,
} from '../src/common/security/cors-config';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrows(fn: () => void, expectedMessage: string): void {
  try {
    fn();
  } catch (error: unknown) {
    const actual = error instanceof Error ? error.message : String(error);
    assert(actual.includes(expectedMessage), `expected error including "${expectedMessage}", got "${actual}"`);
    return;
  }

  throw new Error(`expected function to throw: ${expectedMessage}`);
}

function runOriginCheck(
  delegate: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void,
  origin: string | undefined,
): Promise<{ error: Error | null; allow?: boolean }> {
  return new Promise((resolve) => {
    delegate(origin, (error, allow) => resolve({ error, allow }));
  });
}

async function run(): Promise<void> {
  const allowedOrigins = parseAllowedCorsOrigins('https://app.example.com:443,http://localhost:3000');

  assertCorsConfigInProduction(allowedOrigins, true);

  const delegate = createCorsOriginDelegate(allowedOrigins);

  const allowResult = await runOriginCheck(delegate, 'https://app.example.com');
  assert(allowResult.error === null && allowResult.allow === true, 'whitelisted origin should pass');

  const denyResult = await runOriginCheck(delegate, 'https://evil.example.com');
  assert(denyResult.error instanceof Error, 'non-whitelisted origin should fail');

  const emptyOriginResult = await runOriginCheck(delegate, undefined);
  assert(emptyOriginResult.error instanceof Error, 'empty origin should fail');

  expectThrows(() => assertCorsConfigInProduction([], true), 'CORS_ORIGIN must be explicitly configured in production');

  console.log('cors strict config checks passed');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
