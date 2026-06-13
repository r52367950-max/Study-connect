import { RateLimitService, __rateLimitTesting } from '../src/common/rate-limit.service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function run(): Promise<void> {
  // Simulates two app/service instances wired to the same distributed store. In production this
  // shared store is Redis; the assertion protects the multi-instance contract that login failure
  // counters accumulate across instances for the same IP/identifier until they lock.
  const sharedStore = new __rateLimitTesting.LocalRateLimitStore();
  const instanceA = new RateLimitService(undefined, sharedStore);
  const instanceB = new RateLimitService(undefined, sharedStore);
  const identifier = 'shared-victim@example.com';
  const ip = '203.0.113.80';
  const failurePolicy = {
    identifier,
    ip,
    failureWindowMs: 60_000,
    maxFailures: 3,
    lockMs: 300_000,
    ipOnlyMaxFailures: 100,
  };

  await instanceA.recordLoginFailure(failurePolicy);
  await instanceB.recordLoginFailure(failurePolicy);
  assert(
    (await instanceA.checkLoginLock(instanceA.buildLoginLockKey(identifier, ip))).locked === false,
    'lock should not engage before the shared threshold',
  );

  await instanceA.recordLoginFailure(failurePolicy);
  assert(
    (await instanceB.checkLoginLock(instanceB.buildLoginLockKey(identifier, ip))).locked === true,
    'failures recorded by multiple instances must accumulate in one shared store and lock',
  );

  await sharedStore.onModuleDestroy();
  console.log('min-rate-limit-shared-store-check passed');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
