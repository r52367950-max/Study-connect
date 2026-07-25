import { Module, Provider, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { RateLimitGuard } from './common/rate-limit.guard';
import { RateLimitModule } from './common/rate-limit.module';
import { CsrfGuard } from './common/security/csrf.guard';
import { SecurityModule } from './common/security/security.module';
import { PrismaModule } from './infra';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { DownloadsModule } from './modules/downloads/downloads.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { SearchModule } from './modules/search/search.module';
import { UsersModule } from './modules/users/users.module';
import { ViewEventsModule } from './modules/view-events/view-events.module';
import { HealthModule } from './modules/health/health.module';

export const APP_GUARD_CHAIN = [RateLimitGuard, CsrfGuard, JwtAuthGuard, RolesGuard] as const;

/** Correlation ids we are willing to echo from a client: short, opaque, single-line. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Honor an inbound `x-request-id` for trace correlation, but only when it is a
 * bounded, opaque token. The header is attacker-controlled and lands in every log
 * line for the request, so accepting it verbatim allowed newline-based log forging
 * (injecting fabricated entries) and unbounded strings repeated across each line.
 * Anything else — including a repeated header, which arrives as an array — gets a
 * fresh UUID.
 */
function resolveRequestId(headerValue: string | string[] | undefined): string {
  return typeof headerValue === 'string' && REQUEST_ID_PATTERN.test(headerValue)
    ? headerValue
    : randomUUID();
}

/** Secrets that travel in a URL path rather than a header or body. */
const SENSITIVE_PATH_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/^\/downloads\/[^/?#]+/, '/downloads/[REDACTED]'],
];

function redactSensitivePath(url: string): string {
  for (const [pattern, replacement] of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(url)) {
      return url.replace(pattern, replacement);
    }
  }
  return url;
}

const appGuardProviders: Provider[] = APP_GUARD_CHAIN.map((guardClass: Type<unknown>) => ({
  provide: APP_GUARD,
  useClass: guardClass,
}));

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password', '*.passwordHash', '*.codeHash',
            '*.token', '*.accessToken', '*.refreshToken',
          ],
          censor: '[REDACTED]',
        },
        autoLogging: true,
        genReqId: (req: IncomingMessage) => resolveRequestId(req.headers['x-request-id']),
        customProps: (req: IncomingMessage & { id?: unknown }) => ({ reqId: req.id }),
        serializers: {
          // autoLogging writes req.url for every request, and the one-time
          // download token travels in the path (GET /downloads/:token). That put a
          // live credential into the application log, log shipper and any log
          // aggregator. Mask it; the rest of the URL is kept for debugging.
          req(req: { url?: string; [key: string]: unknown }) {
            return typeof req.url === 'string'
              ? { ...req, url: redactSensitivePath(req.url) }
              : req;
          },
        },
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    RateLimitModule,
    SecurityModule,
    AuthModule,
    UsersModule,
    MaterialsModule,
    FavoritesModule,
    SchoolsModule,
    ViewEventsModule,
    AdminModule,
    ReviewsModule,
    DownloadsModule,
    SearchModule,
    HealthModule,
  ],
  providers: appGuardProviders,
})
export class AppModule {}
