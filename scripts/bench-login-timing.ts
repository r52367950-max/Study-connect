/**
 * bench-login-timing: quantifies the login account-enumeration timing oracle.
 *
 *   ts-node scripts/bench-login-timing.ts
 *
 * Drives AuthService.login directly against an in-memory Prisma double, timing
 * two failure paths that must be indistinguishable to an attacker:
 *   (a) identifier does not exist
 *   (b) identifier exists, password is wrong
 *
 * Reports the shipped behaviour and, for contrast, the previous behaviour (which
 * skipped key derivation entirely on path (a)). Manual evidence tool, not CI.
 */
import { UnauthorizedException } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AuthService } from '../src/modules/auth/auth.service';
import { RateLimitService } from '../src/common/rate-limit.service';

const scryptAsync = promisify(scrypt);
const SAMPLES = 40;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, savedHash] = stored.split(':');
  if (!salt || !savedHash) return false;
  const input = (await scryptAsync(password, salt, 64)) as Buffer;
  const saved = Buffer.from(savedHash, 'hex');
  return saved.length === input.length && timingSafeEqual(saved, input);
}

function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

function summarise(label: string, values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  console.log(
    `  ${label.padEnd(32)} p50=${percentile(values, 0.5).toFixed(1).padStart(7)}ms  ` +
      `p95=${percentile(values, 0.95).toFixed(1).padStart(7)}ms  mean=${mean.toFixed(1).padStart(7)}ms`,
  );
  return mean;
}

async function measure(fn: () => Promise<void>): Promise<number[]> {
  await fn();
  await fn();
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const start = process.hrtime.bigint();
    await fn();
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  return samples;
}

async function run() {
  const knownHash = await hashPassword('CorrectHorseBattery1!');
  const known = {
    id: 'u1',
    email: 'victim@example.com',
    phone: null,
    username: 'victim',
    role: 'USER',
    status: 'ACTIVE',
    tokenVersion: 0,
    passwordHash: knownHash,
  };

  const prisma = {
    user: {
      findFirst: async ({ where }: { where: { email?: string } }) =>
        where.email === known.email ? known : null,
    },
  };
  const config = { get: (key: string) => (key === 'JWT_SECRET' ? 'x'.repeat(48) : undefined) };
  const rateLimit = {
    buildLoginLockKey: () => 'k',
    checkLoginLock: async () => ({ locked: false, retryAfterMs: 0 }),
    recordLoginFailure: async () => undefined,
    recordLoginSuccess: async () => undefined,
  } as unknown as RateLimitService;
  const otp = { consume: async () => undefined };

  const service = new AuthService(
    prisma as never,
    config as never,
    rateLimit,
    otp as never,
  );

  async function attempt(email: string, password: string): Promise<void> {
    try {
      await service.login({ email, password } as never, '203.0.113.9');
      throw new Error('login unexpectedly succeeded');
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    }
  }

  console.log(`AuthService.login failure-path timing, ${SAMPLES} samples each\n`);

  console.log('SHIPPED (decoy scrypt on the unknown-identifier path):');
  const unknownNow = await measure(() => attempt('nobody@example.com', 'Whatever123!'));
  const wrongPwNow = await measure(() => attempt(known.email, 'WrongPassword123!'));
  const a = summarise('(a) identifier does not exist', unknownNow);
  const b = summarise('(b) exists, wrong password', wrongPwNow);
  const ratioNow = Math.max(a, b) / Math.min(a, b);
  const gapNow = Math.abs(a - b);
  console.log(`  -> ratio ${ratioNow.toFixed(2)}x, absolute gap ${gapNow.toFixed(1)}ms`);

  console.log('\nPREVIOUS (no key derivation when the identifier is unknown):');
  // Same code path minus the decoy work: the lookup miss returned immediately.
  const unknownBefore = await measure(async () => {
    await prisma.user.findFirst({ where: { email: 'nobody@example.com' } });
  });
  const wrongPwBefore = await measure(async () => {
    const user = await prisma.user.findFirst({ where: { email: known.email } });
    await verifyPassword('WrongPassword123!', user!.passwordHash);
  });
  const c = summarise('(a) identifier does not exist', unknownBefore);
  const d = summarise('(b) exists, wrong password', wrongPwBefore);
  console.log(`  -> ratio ${(Math.max(c, d) / Math.min(c, d)).toFixed(0)}x, absolute gap ${Math.abs(c - d).toFixed(1)}ms`);

  console.log(
    `\nA single request could previously classify an identifier with a ~${Math.abs(c - d).toFixed(0)}ms margin;` +
      ` the shipped paths differ by ${gapNow.toFixed(1)}ms (${((gapNow / Math.max(a, b)) * 100).toFixed(1)}% of the response).`,
  );
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
