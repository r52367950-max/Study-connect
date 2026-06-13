import { parseTrustProxy } from '../src/common/security/trust-proxy';
import { RateLimitService } from '../src/common/rate-limit.service';
import { normalizePhone } from '../src/common/util';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function run(): Promise<void> {
  // ---- S2a: TRUST_PROXY parsing must never enable trust for "off" values ----
  assert(parseTrustProxy(undefined).enabled === false, 'unset TRUST_PROXY should disable trust');
  assert(parseTrustProxy('').enabled === false, 'empty TRUST_PROXY should disable trust');
  assert(parseTrustProxy('   ').enabled === false, 'whitespace TRUST_PROXY should disable trust');
  assert(parseTrustProxy('0').enabled === false, 'TRUST_PROXY="0" must NOT enable trust');

  for (const bad of ['false', 'abc', '-1', '1.5', 'true', 'on']) {
    let threw = false;
    try {
      parseTrustProxy(bad);
    } catch {
      threw = true;
    }
    assert(threw, `TRUST_PROXY=${JSON.stringify(bad)} must reject boot (throw), not silently enable trust`);
  }

  const twoHops = parseTrustProxy('2');
  assert(twoHops.enabled === true && twoHops.hops === 2, 'TRUST_PROXY="2" should trust exactly 2 hops');
  console.log('trust-proxy negative-path check passed');

  // ---- S2b: phone format variants must collapse to the same login-lock key ----
  const svc = new RateLimitService();
  const ip = '203.0.113.7';

  assert(normalizePhone('138 0000 0000') === '13800000000', 'normalizePhone should strip spaces');
  assert(normalizePhone('138-0000-0000') === '13800000000', 'normalizePhone should strip dashes');

  const groupA = ['138-0000-0000', '138 0000 0000', '13800000000'];
  const expectedA = svc.buildLoginLockKey(normalizePhone(groupA[0]), ip);
  for (const variant of groupA) {
    const key = svc.buildLoginLockKey(normalizePhone(variant), ip);
    assert(key === expectedA, `phone variant ${JSON.stringify(variant)} must share one lock key, got ${key}`);
  }

  const groupB = ['+86 138-0000-0000', '+8613800000000'];
  const expectedB = svc.buildLoginLockKey(normalizePhone(groupB[0]), ip);
  for (const variant of groupB) {
    const key = svc.buildLoginLockKey(normalizePhone(variant), ip);
    assert(key === expectedB, `phone variant ${JSON.stringify(variant)} must share one lock key, got ${key}`);
  }
  console.log('phone-normalization lock-key check passed');

  // ---- S2c: lock key is scoped by IP, so failures from one IP cannot lock another ----
  const fromIp1 = svc.buildLoginLockKey('13800000000', '198.51.100.1');
  const fromIp2 = svc.buildLoginLockKey('13800000000', '198.51.100.2');
  assert(fromIp1 !== fromIp2, 'same identity from different IPs must produce distinct lock keys');
  console.log('login-lock per-IP isolation check passed');

  // ---- C5: a successful login must NOT reset the pure-IP credential-stuffing counter ----
  // Otherwise an attacker controlling one valid account could interleave a success between
  // failed attempts against rotating identifiers to keep the IP-only counter below the lock.
  const stuffSvc = new RateLimitService();
  const attackIp = '198.51.100.50';
  const failOpts = { ip: attackIp, failureWindowMs: 60_000, maxFailures: 100, lockMs: 300_000, ipOnlyMaxFailures: 3 };
  await stuffSvc.recordLoginFailure({ identifier: 'victim-a@example.com', ...failOpts }); // IP fails: 1
  await stuffSvc.recordLoginFailure({ identifier: 'victim-b@example.com', ...failOpts }); // IP fails: 2
  await stuffSvc.recordLoginSuccess('attacker-own@example.com', attackIp); // must NOT reset IP-only counter
  assert(
    (await stuffSvc.checkLoginIpOnlyLock(attackIp)).locked === false,
    'IP-only lock should not engage before threshold',
  );
  await stuffSvc.recordLoginFailure({ identifier: 'victim-c@example.com', ...failOpts }); // IP fails: 3 -> lock
  assert(
    (await stuffSvc.checkLoginIpOnlyLock(attackIp)).locked === true,
    'successful login must not reset the IP-only failure counter (credential-stuffing bypass)',
  );
  console.log('login-ip-only counter survives success check passed');

  console.log('min-rate-limit-identity-check passed');
}

try {
  void run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
