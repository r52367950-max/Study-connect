import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { normalizeOrigin } from './cors-config';
import { CsrfService } from './csrf.service';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly csrfService: CsrfService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const requestOrigin = this.extractRequestOrigin(request);
    this.assertOriginAllowed(requestOrigin);

    const cookieToken = this.csrfService.extractCsrfCookie(request.headers.cookie);
    const csrfHeaderName = this.csrfService.getCsrfHeaderName();
    const headerToken = request.headers[csrfHeaderName] as string | undefined;

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException('Missing CSRF token');
    }

    if (!this.csrfService.tokensMatch(cookieToken, headerToken)) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }

  private extractRequestOrigin(request: Request): string {
    const origin = request.headers.origin;
    if (typeof origin === 'string' && origin.length > 0) {
      try {
        return normalizeOrigin(origin);
      } catch {
        throw new ForbiddenException('Invalid origin header');
      }
    }

    const referer = request.headers.referer;
    if (typeof referer === 'string' && referer.length > 0) {
      try {
        return new URL(referer).origin;
      } catch {
        throw new ForbiddenException('Invalid referer header');
      }
    }

    throw new ForbiddenException('Missing origin or referer');
  }

  private assertOriginAllowed(origin: string): void {
    const allowList = this.parseAllowedOrigins();
    if (!allowList.includes(origin)) {
      throw new ForbiddenException('Origin not allowed');
    }
  }

  private parseAllowedOrigins(): string[] {
    const raw = this.configService.get<string>('CORS_ORIGIN') ?? '';
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
      .map((origin) => {
        try {
          return normalizeOrigin(origin);
        } catch {
          return origin;
        }
      });
  }
}
