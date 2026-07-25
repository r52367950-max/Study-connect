import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { normalizeOrigin } from './cors-config';
import { CsrfService } from './csrf.service';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class CsrfGuard implements CanActivate {
  private originCache: { raw: string; origins: ReadonlySet<string> } | null = null;

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
    const headerToken = this.extractSingleHeader(request.headers[csrfHeaderName]);

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException('Missing CSRF token');
    }

    if (!this.csrfService.tokensMatch(cookieToken, headerToken)) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }

  private extractSingleHeader(value: string | string[] | undefined): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    return undefined;
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
    if (!this.getAllowedOrigins().has(origin)) {
      throw new ForbiddenException('Origin not allowed');
    }
  }

  /**
   * Allow-list of origins, parsed once per CORS_ORIGIN value.
   *
   * This runs on every state-changing request, and previously re-split the config
   * string and re-parsed each entry through the URL constructor every time, then
   * did a linear scan. The parsed result is cached against the raw value so a
   * config change is still picked up, and membership is a Set lookup.
   */
  private getAllowedOrigins(): ReadonlySet<string> {
    const raw = this.configService.get<string>('CORS_ORIGIN') ?? '';
    if (this.originCache?.raw === raw) {
      return this.originCache.origins;
    }

    const origins = new Set(
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
        .map((origin) => {
          try {
            return normalizeOrigin(origin);
          } catch {
            // Keep an unparsable entry verbatim: it can then only ever match an
            // identical literal, rather than being silently dropped from the
            // allow-list (which would loosen nothing, but hides a config typo).
            return origin;
          }
        }),
    );

    this.originCache = { raw, origins };
    return origins;
  }
}
