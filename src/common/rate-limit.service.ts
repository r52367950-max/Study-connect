import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

type CounterState = {
  count: number;
  resetAt: number;
};

type LockState = {
  failures: number;
  firstFailureAt: number;
  lockUntil: number;
  /** Failure window active when the entry was written; used by the sweeper to age it out. */
  failureWindowMs: number;
};

const SWEEP_INTERVAL_MS = 60_000;
/** Cap identifier length inside lock keys so attacker-supplied identifiers cannot bloat key size. */
const MAX_IDENTIFIER_KEY_LENGTH = 128;

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly counters = new Map<string, CounterState>();
  private readonly loginLocks = new Map<string, LockState>();
  private readonly metrics = new Map<string, number>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor() {
    // Counters/locks only get deleted on successful login otherwise; sweep expired
    // entries periodically so the maps cannot grow without bound. unref() keeps the
    // timer from holding the process open (min-* scripts, tests).
    this.sweepTimer = setInterval(() => this.sweepExpired(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

  private sweepExpired(now = Date.now()): void {
    for (const [key, state] of this.counters) {
      if (state.resetAt <= now) {
        this.counters.delete(key);
      }
    }
    for (const [key, state] of this.loginLocks) {
      if (state.lockUntil <= now && now - state.firstFailureAt > state.failureWindowMs) {
        this.loginLocks.delete(key);
      }
    }
  }

  checkAndConsume(input: {
    ruleName: string;
    key: string;
    limit: number;
    windowMs: number;
    route: string;
    method: string;
    ip: string;
  }): { allowed: boolean; retryAfterMs: number; remaining: number } {
    const now = Date.now();
    const counterKey = `${input.ruleName}:${input.key}`;
    const state = this.counters.get(counterKey);

    if (!state || state.resetAt <= now) {
      this.counters.set(counterKey, { count: 1, resetAt: now + input.windowMs });
      return { allowed: true, retryAfterMs: 0, remaining: Math.max(input.limit - 1, 0) };
    }

    if (state.count >= input.limit) {
      const retryAfterMs = Math.max(state.resetAt - now, 1);
      this.recordLimitHit({
        metricKey: `rate_limit.rule.${input.ruleName}`,
        rule: input.ruleName,
        key: input.key,
        route: input.route,
        method: input.method,
        ip: input.ip,
        retryAfterMs,
      });
      return { allowed: false, retryAfterMs, remaining: 0 };
    }

    state.count += 1;
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.max(input.limit - state.count, 0),
    };
  }

  checkLoginLock(key: string): { locked: boolean; retryAfterMs: number } {
    const state = this.loginLocks.get(key);
    if (!state) {
      return { locked: false, retryAfterMs: 0 };
    }

    const now = Date.now();
    if (state.lockUntil > now) {
      return { locked: true, retryAfterMs: state.lockUntil - now };
    }

    return { locked: false, retryAfterMs: 0 };
  }

  recordLoginFailure(input: {
    identifier: string;
    ip: string;
    failureWindowMs: number;
    maxFailures: number;
    lockMs: number;
    ipOnlyMaxFailures?: number;
  }): void {
    const now = Date.now();
    for (const key of this.buildLoginLockKeys(input.identifier, input.ip)) {
      const state = this.loginLocks.get(key);
      if (!state || now - state.firstFailureAt > input.failureWindowMs) {
        this.loginLocks.set(key, {
          failures: 1,
          firstFailureAt: now,
          lockUntil: 0,
          failureWindowMs: input.failureWindowMs,
        });
        continue;
      }

      state.failures += 1;
      if (state.failures >= input.maxFailures) {
        state.lockUntil = now + input.lockMs;
        this.recordLimitHit({
          metricKey: 'rate_limit.rule.auth-login-lock',
          rule: 'auth-login-lock',
          key,
          route: '/auth/login',
          method: 'POST',
          ip: input.ip,
          retryAfterMs: input.lockMs,
        });
      }
    }

    // B3: pure-IP failure counter to catch credential-stuffing with rotating identifiers.
    // Threshold N = ipOnlyMaxFailures (default 10); same window/lock timing as per-identity lock.
    const ipMaxFailures = input.ipOnlyMaxFailures ?? 10;
    const ipKey = this.buildLoginIpOnlyKey(input.ip);
    const ipState = this.loginLocks.get(ipKey);
    if (!ipState || now - ipState.firstFailureAt > input.failureWindowMs) {
      this.loginLocks.set(ipKey, {
        failures: 1,
        firstFailureAt: now,
        lockUntil: 0,
        failureWindowMs: input.failureWindowMs,
      });
    } else {
      ipState.failures += 1;
      if (ipState.failures >= ipMaxFailures) {
        ipState.lockUntil = now + input.lockMs;
        this.recordLimitHit({
          metricKey: 'rate_limit.rule.auth-login-ip-fail',
          rule: 'auth-login-ip-fail',
          key: ipKey,
          route: '/auth/login',
          method: 'POST',
          ip: input.ip,
          retryAfterMs: input.lockMs,
        });
      }
    }
  }

  recordLoginSuccess(identifier: string, ip: string): void {
    for (const key of this.buildLoginLockKeys(identifier, ip)) {
      this.loginLocks.delete(key);
    }
    // C5 (security): intentionally do NOT clear the pure-IP failure counter on success.
    // Clearing it let an attacker who controls one valid account interleave a successful
    // login between failed attempts against other identifiers to keep resetting the
    // credential-stuffing counter before it ever locks. The IP-only counter instead ages
    // out naturally via failureWindowMs, which still spares legitimate shared-NAT users.
  }

  checkLoginIpOnlyLock(ip: string): { locked: boolean; retryAfterMs: number } {
    return this.checkLoginLock(this.buildLoginIpOnlyKey(ip));
  }

  /**
   * Login-lock key. Scoped by identifier AND client IP so a third party cannot
   * lock a victim's account from arbitrary IPs (remote-lockout DoS); a brute
   * forcer still gets their own (identifier, ip) pair locked after N failures.
   */
  buildLoginLockKey(identifier: string, ip: string): string {
    return `login-id:${identifier.toLowerCase().slice(0, MAX_IDENTIFIER_KEY_LENGTH)}:${ip}`;
  }

  /** Pure-IP failure key used to detect credential stuffing with rotating identifiers (B3). */
  buildLoginIpOnlyKey(ip: string): string {
    return `login-ip-only:${ip}`;
  }

  private buildLoginLockKeys(identifier: string, ip: string): string[] {
    return [this.buildLoginLockKey(identifier, ip)];
  }

  private recordLimitHit(input: {
    metricKey: string;
    rule: string;
    key: string;
    route: string;
    method: string;
    ip: string;
    retryAfterMs: number;
  }): void {
    this.metrics.set(input.metricKey, (this.metrics.get(input.metricKey) ?? 0) + 1);
    this.metrics.set('rate_limit.hits.total', (this.metrics.get('rate_limit.hits.total') ?? 0) + 1);

    this.logger.warn({
        event: 'rate_limit_blocked',
        ts: new Date().toISOString(),
        rule: input.rule,
        key: input.key,
        route: input.route,
        method: input.method,
        ip: input.ip,
        retryAfterMs: input.retryAfterMs,
      });

    this.logger.log({
        event: 'rate_limit_metric',
        ts: new Date().toISOString(),
        metric: input.metricKey,
        value: this.metrics.get(input.metricKey),
      });
  }
}
