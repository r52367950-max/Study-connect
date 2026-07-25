import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RATE_LIMIT_RULES_KEY, RateLimitRule } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';
import { normalizePhone } from './util';

const DEFAULT_GLOBAL_LIMIT = 120;
const DEFAULT_GLOBAL_WINDOW_MS = 60_000;
const DEFAULT_LOGIN_LIMIT = 20;
const DEFAULT_LOGIN_WINDOW_MS = 60_000;
const DEFAULT_LOGIN_FAILURE_WINDOW_MS = 60_000;
const DEFAULT_LOGIN_MAX_FAILURES = 5;
const DEFAULT_LOGIN_LOCK_MS = 5 * 60_000;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    try {
      return await this.enforce(context);
    } catch (error) {
      // A 429 (or any other deliberate rejection) passes straight through.
      if (error instanceof HttpException) {
        throw error;
      }
      // Reaching here means the rate-limit store itself failed — e.g. Redis is
      // unreachable. Stay fail-closed (never serve a request we could not meter),
      // but say so explicitly: this previously surfaced as an opaque 500 that was
      // indistinguishable from an application bug in logs and dashboards.
      this.logger.error({
        event: 'rate_limit_store_unavailable',
        ts: new Date().toISOString(),
        reason: error instanceof Error ? error.message : String(error),
      });
      throw new ServiceUnavailableException('Rate limiting unavailable');
    }
  }

  private async enforce(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.extractIp(request);
    const method = request.method;
    const route = request.route?.path ? `${request.baseUrl}${request.route.path}` : request.url;

    const globalRule: RateLimitRule = {
      name: 'global-basic',
      limit: this.getNumber('RATE_LIMIT_GLOBAL_LIMIT', DEFAULT_GLOBAL_LIMIT),
      windowMs: this.getNumber('RATE_LIMIT_GLOBAL_WINDOW_MS', DEFAULT_GLOBAL_WINDOW_MS),
      keyPrefix: 'ip',
    };

    await this.assertAllowed(globalRule, `ip:${ip}`, { route, method, ip });

    const routeRules =
      this.reflector.getAllAndOverride<RateLimitRule[]>(RATE_LIMIT_RULES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    for (const rule of routeRules) {
      await this.assertAllowed(rule, `${rule.keyPrefix ?? 'ip'}:${ip}`, { route, method, ip });
    }

    if (method === 'POST' && request.path === '/auth/login') {
      // B3: check pure-IP failure lock first (catches credential stuffing with rotating identifiers)
      const ipOnlyLock = await this.rateLimitService.checkLoginIpOnlyLock(ip);
      if (ipOnlyLock.locked) {
        throw new HttpException(
          `Too many login failures from this IP, retry in ${Math.ceil(ipOnlyLock.retryAfterMs / 1000)}s`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const identity = this.extractIdentifier(request);
      if (identity) {
        const lock = await this.rateLimitService.checkLoginLock(
          this.rateLimitService.buildLoginLockKey(identity, ip),
        );
        if (lock.locked) {
          throw new HttpException(
            `Too many login failures, retry in ${Math.ceil(lock.retryAfterMs / 1000)}s`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        const loginRule: RateLimitRule = {
          name: 'auth-login-ip-email',
          limit: this.getNumber('RATE_LIMIT_LOGIN_LIMIT', DEFAULT_LOGIN_LIMIT),
          windowMs: this.getNumber('RATE_LIMIT_LOGIN_WINDOW_MS', DEFAULT_LOGIN_WINDOW_MS),
        };

        await this.assertAllowed(loginRule, `${ip}:${identity}`, { route, method, ip });
      }
    }

    return true;
  }

  getLoginFailurePolicy(): { failureWindowMs: number; maxFailures: number; lockMs: number } {
    return {
      failureWindowMs: this.getNumber('RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS', DEFAULT_LOGIN_FAILURE_WINDOW_MS),
      maxFailures: this.getNumber('RATE_LIMIT_LOGIN_MAX_FAILURES', DEFAULT_LOGIN_MAX_FAILURES),
      lockMs: this.getNumber('RATE_LIMIT_LOGIN_LOCK_MS', DEFAULT_LOGIN_LOCK_MS),
    };
  }

  private async assertAllowed(
    rule: RateLimitRule,
    key: string,
    context: { route: string; method: string; ip: string },
  ): Promise<void> {
    const result = await this.rateLimitService.checkAndConsume({
      ruleName: rule.name,
      key,
      limit: rule.limit,
      windowMs: rule.windowMs,
      route: context.route,
      method: context.method,
      ip: context.ip,
    });

    if (!result.allowed) {
      throw new HttpException(
        `Rate limit exceeded for ${rule.name}, retry in ${Math.ceil(result.retryAfterMs / 1000)}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private extractIp(request: Request): string {
    // Only honor X-Forwarded-For when a positive proxy-hop count was configured
    // (main.ts only sets 'trust proxy' to a number when TRUST_PROXY is enabled).
    // An explicit numeric check avoids Boolean()-coercing a stray string to true.
    const app = request.app as { get?: (key: string) => unknown } | undefined;
    const proxySetting = app?.get?.('trust proxy');
    const trustProxyEnabled = typeof proxySetting === 'number' && proxySetting > 0;
    if (trustProxyEnabled) {
      return request.ip || request.socket.remoteAddress || 'unknown';
    }
    return request.socket.remoteAddress || 'unknown';
  }

  private extractIdentifier(request: Request): string | null {
    const body = request.body as { email?: unknown; phone?: unknown };
    if (!body) {
      return null;
    }
    if (typeof body.email === 'string' && body.email.trim().length > 0) {
      return body.email.trim().toLowerCase();
    }
    // Normalize the phone exactly as auth.service does (strip spaces/dashes,
    // lowercase) so per-identity counters and the login lock land on the same
    // key regardless of how the caller formatted the number.
    if (typeof body.phone === 'string' && body.phone.trim().length > 0) {
      return normalizePhone(body.phone).toLowerCase();
    }
    return null;
  }

  private getNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
