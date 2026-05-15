import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RATE_LIMIT_RULES_KEY, RateLimitRule } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

const DEFAULT_GLOBAL_LIMIT = 120;
const DEFAULT_GLOBAL_WINDOW_MS = 60_000;
const DEFAULT_LOGIN_LIMIT = 20;
const DEFAULT_LOGIN_WINDOW_MS = 60_000;
const DEFAULT_LOGIN_FAILURE_WINDOW_MS = 60_000;
const DEFAULT_LOGIN_MAX_FAILURES = 5;
const DEFAULT_LOGIN_LOCK_MS = 5 * 60_000;

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

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

    this.assertAllowed(globalRule, `ip:${ip}`, { route, method, ip });

    const routeRules =
      this.reflector.getAllAndOverride<RateLimitRule[]>(RATE_LIMIT_RULES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    for (const rule of routeRules) {
      this.assertAllowed(rule, `${rule.keyPrefix ?? 'ip'}:${ip}`, { route, method, ip });
    }

    if (method === 'POST' && request.path === '/auth/login') {
      const identity = this.extractIdentifier(request);
      if (identity) {
        const lock = this.rateLimitService.checkLoginLock(`login-id:${identity}`);
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

        this.assertAllowed(loginRule, `${ip}:${identity}`, { route, method, ip });
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

  private assertAllowed(
    rule: RateLimitRule,
    key: string,
    context: { route: string; method: string; ip: string },
  ): void {
    const result = this.rateLimitService.checkAndConsume({
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
    const xff = request.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim().length > 0) {
      return xff.split(',')[0].trim();
    }

    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  private extractIdentifier(request: Request): string | null {
    const body = request.body as { email?: unknown; phone?: unknown };
    if (!body) {
      return null;
    }
    if (typeof body.email === 'string' && body.email.trim().length > 0) {
      return body.email.trim().toLowerCase();
    }
    if (typeof body.phone === 'string' && body.phone.trim().length > 0) {
      return body.phone.trim();
    }
    return null;
  }

  private getNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
