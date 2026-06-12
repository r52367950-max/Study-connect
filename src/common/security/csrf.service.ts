import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Response } from 'express';
import { safeDecodeURIComponent } from '../util';

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_HEX_LENGTH = 64;
const CSRF_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

@Injectable()
export class CsrfService {
  constructor(private readonly configService: ConfigService) {}

  issueToken(response: Response): string {
    const token = randomBytes(32).toString('hex');
    response.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: this.getCookieSecure(),
      sameSite: this.getCookieSameSite(),
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return token;
  }

  getCsrfCookieName(): string {
    return CSRF_COOKIE_NAME;
  }

  getCsrfHeaderName(): string {
    return CSRF_HEADER_NAME;
  }

  extractCsrfCookie(cookieHeader?: string): string | null {
    if (!cookieHeader) {
      return null;
    }

    const cookieEntries = cookieHeader.split(';');
    for (const entry of cookieEntries) {
      const [rawName, ...rawValue] = entry.trim().split('=');
      if (rawName === CSRF_COOKIE_NAME && rawValue.length > 0) {
        const decoded = safeDecodeURIComponent(rawValue.join('='));
        return this.isWellFormedToken(decoded) ? decoded : null;
      }
    }
    return null;
  }

  tokensMatch(cookieToken: string, headerToken: string): boolean {
    if (!this.isWellFormedToken(cookieToken) || !this.isWellFormedToken(headerToken)) {
      return false;
    }

    const cookieBuffer = Buffer.from(cookieToken, 'hex');
    const headerBuffer = Buffer.from(headerToken, 'hex');

    return timingSafeEqual(cookieBuffer, headerBuffer);
  }

  isWellFormedToken(token: string): boolean {
    return token.length === CSRF_TOKEN_HEX_LENGTH && CSRF_TOKEN_PATTERN.test(token);
  }

  private getCookieSecure(): boolean {
    return this.configService.get<string>('AUTH_COOKIE_SECURE') === 'true';
  }

  private getCookieSameSite(): 'lax' | 'strict' | 'none' {
    const sameSite = (this.configService.get<string>('AUTH_COOKIE_SAMESITE') ?? 'lax').toLowerCase();
    if (sameSite === 'strict' || sameSite === 'none') {
      return sameSite;
    }
    return 'lax';
  }
}
