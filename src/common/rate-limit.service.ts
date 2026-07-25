import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { createConnection, Socket } from 'net';
import { connect as createTlsConnection, TLSSocket } from 'tls';
import { URL } from 'url';

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

export type RateLimitDecision = { allowed: boolean; retryAfterMs: number; remaining: number };
export type LoginLockDecision = { locked: boolean; retryAfterMs: number };

export type RateLimitConsumeInput = {
  ruleName: string;
  key: string;
  limit: number;
  windowMs: number;
  route: string;
  method: string;
  ip: string;
};

export type LoginFailureInput = {
  identifier: string;
  ip: string;
  failureWindowMs: number;
  maxFailures: number;
  lockMs: number;
  ipOnlyMaxFailures?: number;
};

export interface RateLimitStore extends OnModuleDestroy {
  checkAndConsume(input: RateLimitConsumeInput): Promise<RateLimitDecision>;
  checkLoginLock(key: string): Promise<LoginLockDecision>;
  recordLoginFailure(input: LoginFailureInput, keys: { identityKeys: string[]; ipOnlyKey: string }): Promise<string[]>;
  recordLoginSuccess(keys: string[]): Promise<void>;
  checkLoginIpOnlyLock(ipOnlyKey: string): Promise<LoginLockDecision>;
  sweepExpired(now?: number): Promise<void>;
}

const SWEEP_INTERVAL_MS = 60_000;
/** Cap identifier length inside lock keys so attacker-supplied identifiers cannot bloat key size. */
const MAX_IDENTIFIER_KEY_LENGTH = 128;
const DEFAULT_REDIS_PREFIX = 'study-connect:rate-limit:';

class LocalRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, CounterState>();
  private readonly loginLocks = new Map<string, LockState>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor() {
    // Counters/locks only get deleted on successful login otherwise; sweep expired
    // entries periodically so the maps cannot grow without bound. unref() keeps the
    // timer from holding the process open (min-* scripts, tests).
    this.sweepTimer = setInterval(() => void this.sweepExpired(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

  async sweepExpired(now = Date.now()): Promise<void> {
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

  async checkAndConsume(input: RateLimitConsumeInput): Promise<RateLimitDecision> {
    const now = Date.now();
    const counterKey = `${input.ruleName}:${input.key}`;
    const state = this.counters.get(counterKey);

    if (!state || state.resetAt <= now) {
      this.counters.set(counterKey, { count: 1, resetAt: now + input.windowMs });
      return { allowed: true, retryAfterMs: 0, remaining: Math.max(input.limit - 1, 0) };
    }

    if (state.count >= input.limit) {
      return { allowed: false, retryAfterMs: Math.max(state.resetAt - now, 1), remaining: 0 };
    }

    state.count += 1;
    return { allowed: true, retryAfterMs: 0, remaining: Math.max(input.limit - state.count, 0) };
  }

  async checkLoginLock(key: string): Promise<LoginLockDecision> {
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

  async recordLoginFailure(input: LoginFailureInput, keys: { identityKeys: string[]; ipOnlyKey: string }): Promise<string[]> {
    const lockedKeys: string[] = [];
    const now = Date.now();
    for (const key of keys.identityKeys) {
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
        lockedKeys.push(key);
      }
    }

    // B3: pure-IP failure counter to catch credential-stuffing with rotating identifiers.
    // Threshold N = ipOnlyMaxFailures (default 10); same window/lock timing as per-identity lock.
    const ipMaxFailures = input.ipOnlyMaxFailures ?? 10;
    const ipState = this.loginLocks.get(keys.ipOnlyKey);
    if (!ipState || now - ipState.firstFailureAt > input.failureWindowMs) {
      this.loginLocks.set(keys.ipOnlyKey, {
        failures: 1,
        firstFailureAt: now,
        lockUntil: 0,
        failureWindowMs: input.failureWindowMs,
      });
    } else {
      ipState.failures += 1;
      if (ipState.failures >= ipMaxFailures) {
        ipState.lockUntil = now + input.lockMs;
        lockedKeys.push(keys.ipOnlyKey);
      }
    }
    return lockedKeys;
  }

  async recordLoginSuccess(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.loginLocks.delete(key);
    }
  }

  async checkLoginIpOnlyLock(ipOnlyKey: string): Promise<LoginLockDecision> {
    return this.checkLoginLock(ipOnlyKey);
  }
}

type RedisValue = string | number | null | RedisValue[];
type RedisSocket = Socket | TLSSocket;

class MinimalRedisClient implements OnModuleDestroy {
  private socket: RedisSocket | null = null;
  private buffer = Buffer.alloc(0);
  private queue: Array<{ resolve: (value: RedisValue) => void; reject: (err: Error) => void }> = [];
  private connecting: Promise<void> | null = null;

  constructor(private readonly redisUrl: string) {}

  async command(args: Array<string | number>): Promise<RedisValue> {
    await this.connect();
    // Capture the socket rather than dereferencing this.socket inside the
    // executor: a stale connection's teardown can null the field between the
    // await and the write, which previously threw "cannot read 'write' of null".
    const socket = this.socket;
    if (!socket || socket.destroyed) {
      throw new Error('Redis socket is not connected');
    }
    return new Promise<RedisValue>((resolve, reject) => {
      this.queue.push({ resolve, reject });
      socket.write(this.encode(args));
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.socket) {
      this.socket.end();
      this.socket.destroy();
      this.socket = null;
    }
  }

  private async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<void>((resolve, reject) => {
      const parsed = new URL(this.redisUrl);
      const port = Number(parsed.port || '6379');
      const host = parsed.hostname || '127.0.0.1';
      const socket = parsed.protocol === 'rediss:' ? createTlsConnection({ host, port }) : createConnection({ host, port });
      this.socket = socket;
      socket.once('connect', () => {
        const auth = parsed.password
          ? this.commandConnected(['AUTH', decodeURIComponent(parsed.username || 'default'), decodeURIComponent(parsed.password)])
          : Promise.resolve(null);
        auth
          .then(() => (parsed.pathname && parsed.pathname !== '/' ? this.commandConnected(['SELECT', parsed.pathname.slice(1)]) : null))
          .then(() => resolve())
          .catch(reject);
      });
      // Every handler below is bound to *this* socket, but they mutate state shared
      // across reconnects. Ignore events from a connection that has already been
      // superseded — otherwise a stale socket's late 'close' nulls out the live
      // one and rejects commands that belong to it.
      socket.on('data', (chunk) => {
        if (this.socket === socket) this.handleData(chunk);
      });
      socket.on('error', (err) => {
        if (this.socket === socket) this.rejectAll(err);
      });
      socket.on('close', () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        // Settle anything still in flight. Without this, commands issued just
        // before the peer closed stayed pending forever and every request waiting
        // on the rate limiter hung instead of failing.
        this.rejectAll(new Error('Redis connection closed'));
      });
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private commandConnected(args: Array<string | number>): Promise<RedisValue> {
    return new Promise<RedisValue>((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new Error('Redis socket is not connected'));
        return;
      }
      this.queue.push({ resolve, reject });
      this.socket.write(this.encode(args));
    });
  }

  private encode(args: Array<string | number>): string {
    return `*${args.length}\r\n${args.map((arg) => {
      const text = String(arg);
      return `$${Buffer.byteLength(text)}\r\n${text}\r\n`;
    }).join('')}`;
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.queue.length > 0) {
      let parsed: { value: RedisValue; next: number } | null;
      try {
        parsed = this.parse(0);
      } catch (err) {
        // parse() throws on an error reply (`-ERR ...`) or an unsupported RESP
        // type. This runs inside a 'data' event handler, so letting it escape
        // was an uncaught exception that took the whole process down — any Redis
        // error reply (NOSCRIPT, OOM, READONLY, wrong DB) became a remote crash.
        // Fail the in-flight command instead and drop the desynchronised stream.
        this.rejectAll(err instanceof Error ? err : new Error(String(err)));
        this.buffer = Buffer.alloc(0);
        this.socket?.destroy();
        this.socket = null;
        return;
      }
      if (!parsed) return;
      this.buffer = this.buffer.subarray(parsed.next);
      const pending = this.queue.shift()!;
      pending.resolve(parsed.value);
    }
  }

  private parse(offset: number): { value: RedisValue; next: number } | null {
    if (offset >= this.buffer.length) return null;
    const type = String.fromCharCode(this.buffer[offset]);
    const lineEnd = this.buffer.indexOf('\r\n', offset);
    if (lineEnd < 0) return null;
    const line = this.buffer.toString('utf8', offset + 1, lineEnd);
    const next = lineEnd + 2;
    if (type === '+' || type === ':') return { value: type === ':' ? Number(line) : line, next };
    if (type === '-') throw new Error(`Redis error: ${line}`);
    if (type === '$') {
      const len = Number(line);
      if (len < 0) return { value: null, next };
      if (this.buffer.length < next + len + 2) return null;
      return { value: this.buffer.toString('utf8', next, next + len), next: next + len + 2 };
    }
    if (type === '*') {
      const len = Number(line);
      const values: RedisValue[] = [];
      let cursor = next;
      for (let i = 0; i < len; i += 1) {
        const item = this.parse(cursor);
        if (!item) return null;
        values.push(item.value);
        cursor = item.next;
      }
      return { value: values, next: cursor };
    }
    throw new Error(`Unsupported Redis RESP type: ${type}`);
  }

  private rejectAll(err: Error): void {
    while (this.queue.length > 0) this.queue.shift()!.reject(err);
  }
}

class RedisRateLimitStore implements RateLimitStore {
  private readonly client: MinimalRedisClient;
  /** script body -> SHA1, so the digest is computed once per script, not per request. */
  private readonly scriptShaCache = new Map<string, string>();

  private readonly counterScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

  private readonly loginFailureScript = `
local now = tonumber(ARGV[1])
local failureWindowMs = tonumber(ARGV[2])
local maxFailures = tonumber(ARGV[3])
local lockMs = tonumber(ARGV[4])
local current = redis.call('HMGET', KEYS[1], 'failures', 'firstFailureAt', 'lockUntil')
local failures = tonumber(current[1])
local firstFailureAt = tonumber(current[2])
if failures == nil or firstFailureAt == nil or now - firstFailureAt > failureWindowMs then
  failures = 1
  firstFailureAt = now
else
  failures = failures + 1
end
local lockUntil = tonumber(current[3]) or 0
local locked = 0
if failures >= maxFailures then
  lockUntil = now + lockMs
  locked = 1
end
redis.call('HMSET', KEYS[1], 'failures', failures, 'firstFailureAt', firstFailureAt, 'lockUntil', lockUntil, 'failureWindowMs', failureWindowMs)
local ttl = math.max(failureWindowMs, lockUntil - now)
redis.call('PEXPIRE', KEYS[1], ttl)
return { locked, lockUntil }
`;

  constructor(redisUrl: string, private readonly prefix = DEFAULT_REDIS_PREFIX) {
    this.client = new MinimalRedisClient(redisUrl);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.onModuleDestroy();
  }

  async sweepExpired(): Promise<void> {
    // Redis key TTLs perform the sweep for distributed stores.
  }

  async checkAndConsume(input: RateLimitConsumeInput): Promise<RateLimitDecision> {
    const key = this.key(`counter:${input.ruleName}:${input.key}`);
    const result = await this.evalScript(this.counterScript, key, [input.windowMs]);
    const [countRaw, ttlRaw] = Array.isArray(result) ? result : [0, 0];
    const count = Number(countRaw);
    const ttl = Math.max(Number(ttlRaw), 1);
    if (count > input.limit) {
      return { allowed: false, retryAfterMs: ttl, remaining: 0 };
    }
    return { allowed: true, retryAfterMs: 0, remaining: Math.max(input.limit - count, 0) };
  }

  async checkLoginLock(key: string): Promise<LoginLockDecision> {
    const result = await this.client.command(['HMGET', this.key(`lock:${key}`), 'lockUntil']);
    const [lockUntilRaw] = Array.isArray(result) ? result : [null];
    const lockUntil = Number(lockUntilRaw ?? 0);
    const now = Date.now();
    return lockUntil > now ? { locked: true, retryAfterMs: lockUntil - now } : { locked: false, retryAfterMs: 0 };
  }

  async recordLoginFailure(input: LoginFailureInput, keys: { identityKeys: string[]; ipOnlyKey: string }): Promise<string[]> {
    const lockedKeys: string[] = [];
    const now = Date.now();
    for (const key of keys.identityKeys) {
      if (await this.recordOneFailure(key, now, input.failureWindowMs, input.maxFailures, input.lockMs)) lockedKeys.push(key);
    }
    if (await this.recordOneFailure(keys.ipOnlyKey, now, input.failureWindowMs, input.ipOnlyMaxFailures ?? 10, input.lockMs)) {
      lockedKeys.push(keys.ipOnlyKey);
    }
    return lockedKeys;
  }

  async recordLoginSuccess(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.command(['DEL', ...keys.map((key) => this.key(`lock:${key}`))]);
    }
  }

  async checkLoginIpOnlyLock(ipOnlyKey: string): Promise<LoginLockDecision> {
    return this.checkLoginLock(ipOnlyKey);
  }

  private async recordOneFailure(key: string, now: number, failureWindowMs: number, maxFailures: number, lockMs: number): Promise<boolean> {
    const result = await this.evalScript(this.loginFailureScript, this.key(`lock:${key}`), [
      now,
      failureWindowMs,
      maxFailures,
      lockMs,
    ]);
    const [lockedRaw] = Array.isArray(result) ? result : [0];
    return Number(lockedRaw) === 1;
  }

  /**
   * Run a Lua script by SHA, falling back to a full EVAL when the server does not
   * have it cached.
   *
   * Plain EVAL shipped the entire script body with every single rate-limited
   * request — on the hot path for all traffic. EVALSHA sends a 40-byte digest
   * instead; NOSCRIPT (a cold or restarted/failed-over Redis) is handled by
   * sending the body once, which also re-populates the server's script cache.
   */
  private async evalScript(script: string, key: string, args: Array<string | number>): Promise<RedisValue> {
    const sha = this.scriptSha(script);
    try {
      return await this.client.command(['EVALSHA', sha, 1, key, ...args]);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('NOSCRIPT')) {
        throw error;
      }
      return this.client.command(['EVAL', script, 1, key, ...args]);
    }
  }

  private scriptSha(script: string): string {
    let sha = this.scriptShaCache.get(script);
    if (!sha) {
      sha = createHash('sha1').update(script).digest('hex');
      this.scriptShaCache.set(script, sha);
    }
    return sha;
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly metrics = new Map<string, number>();
  private readonly store: RateLimitStore;

  constructor(@Optional() configService?: ConfigService, @Optional() store?: RateLimitStore) {
    this.store = store ?? this.createStore(configService);
  }

  async onModuleDestroy(): Promise<void> {
    await this.store.onModuleDestroy();
  }

  async sweepExpired(now = Date.now()): Promise<void> {
    await this.store.sweepExpired(now);
  }

  async checkAndConsume(input: RateLimitConsumeInput): Promise<RateLimitDecision> {
    const result = await this.store.checkAndConsume(input);
    if (!result.allowed) {
      this.recordLimitHit({
        metricKey: `rate_limit.rule.${input.ruleName}`,
        rule: input.ruleName,
        key: input.key,
        route: input.route,
        method: input.method,
        ip: input.ip,
        retryAfterMs: result.retryAfterMs,
      });
    }
    return result;
  }

  async checkLoginLock(key: string): Promise<LoginLockDecision> {
    return this.store.checkLoginLock(key);
  }

  async recordLoginFailure(input: LoginFailureInput): Promise<void> {
    const lockedKeys = await this.store.recordLoginFailure(input, {
      identityKeys: this.buildLoginLockKeys(input.identifier, input.ip),
      ipOnlyKey: this.buildLoginIpOnlyKey(input.ip),
    });

    for (const key of lockedKeys) {
      const ipOnly = key === this.buildLoginIpOnlyKey(input.ip);
      this.recordLimitHit({
        metricKey: ipOnly ? 'rate_limit.rule.auth-login-ip-fail' : 'rate_limit.rule.auth-login-lock',
        rule: ipOnly ? 'auth-login-ip-fail' : 'auth-login-lock',
        key,
        route: '/auth/login',
        method: 'POST',
        ip: input.ip,
        retryAfterMs: input.lockMs,
      });
    }
  }

  async recordLoginSuccess(identifier: string, ip: string): Promise<void> {
    await this.store.recordLoginSuccess(this.buildLoginLockKeys(identifier, ip));
    // C5 (security): intentionally do NOT clear the pure-IP failure counter on success.
    // Clearing it let an attacker who controls one valid account interleave a successful
    // login between failed attempts against other identifiers to keep resetting the
    // credential-stuffing counter before it ever locks. The IP-only counter instead ages
    // out naturally via failureWindowMs, which still spares legitimate shared-NAT users.
  }

  async checkLoginIpOnlyLock(ip: string): Promise<LoginLockDecision> {
    return this.store.checkLoginIpOnlyLock(this.buildLoginIpOnlyKey(ip));
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

  private createStore(configService?: ConfigService): RateLimitStore {
    const redisUrl = configService?.get<string>('RATE_LIMIT_REDIS_URL') ?? configService?.get<string>('REDIS_URL');
    if (redisUrl) {
      return new RedisRateLimitStore(redisUrl, configService?.get<string>('RATE_LIMIT_REDIS_PREFIX') ?? DEFAULT_REDIS_PREFIX);
    }

    if ((process.env.NODE_ENV ?? 'development') === 'production') {
      throw new Error('RATE_LIMIT_REDIS_URL or REDIS_URL must be configured in production');
    }

    this.logger.warn('Using local in-memory rate-limit store; configure Redis for shared multi-instance enforcement.');
    return new LocalRateLimitStore();
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

export const __rateLimitTesting = { LocalRateLimitStore, RedisRateLimitStore };
