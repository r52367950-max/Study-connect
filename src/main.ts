import * as Sentry from '@sentry/node';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import compression from 'compression';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response, NextFunction } from 'express';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppModule } from './app.module';
import {
  assertCorsConfigInProduction,
  createCorsOriginDelegate,
  parseAllowedCorsOrigins,
} from './common/security/cors-config';
import { assertSecretStrength } from './common/security/secret-strength';
import { parseTrustProxy } from './common/security/trust-proxy';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? undefined,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.GIT_SHA ?? undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.05'),
    beforeSend(event) {
      if (event.user) { delete (event.user as any).email; delete (event.user as any).phone; }
      return event;
    },
  });
}

async function bootstrap() {
  assertSecretStrength('JWT_SECRET', process.env.JWT_SECRET);
  assertSecretStrength('OTP_SECRET', process.env.OTP_SECRET ?? process.env.JWT_SECRET);

  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(Logger));
  const isProduction = process.env.NODE_ENV === 'production';

  // Explicitly parse TRUST_PROXY (throws on invalid values) and only enable the
  // proxy-trust hop count when a positive integer is configured. Never pass a
  // raw non-numeric string to Express, where it would be coerced to "trust all".
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy.enabled) {
    (app as unknown as { set: (key: string, value: unknown) => void }).set(
      'trust proxy',
      trustProxy.hops,
    );
  }

  if (process.env.AUTH_OTP_TEST_BYPASS === 'true') {
    app.get(Logger).warn('OTP test bypass is ACTIVE');
  }

  app.use(applySecurityHeaders);
  // gzip JSON responses (negotiated via Accept-Encoding). threshold keeps small
  // payloads (e.g. the /auth/csrf token body) uncompressed, which also sidesteps
  // BREACH-style concerns — secrets only travel in sub-threshold responses here.
  // level 6 is zlib's balanced default; COMPRESSION_LEVEL (0-9) overrides, out-of-range
  // values fall back to 6 instead of surfacing as a zlib error on the first response.
  const compressionLevel = Number(process.env.COMPRESSION_LEVEL ?? '6');
  app.use(
    compression({
      threshold: 1024,
      level: compressionLevel >= 0 && compressionLevel <= 9 ? compressionLevel : 6,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(isProduction));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      disableErrorMessages: isProduction,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );

  const allowedOrigins = parseAllowedCorsOrigins();
  assertCorsConfigInProduction(allowedOrigins, isProduction);
  const corsOriginDelegate = createCorsOriginDelegate(allowedOrigins);

  app.enableCors({
    origin: corsOriginDelegate,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    optionsSuccessStatus: 204,
  });

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Study Connect API')
      .setDescription('API documentation for Study Connect backend services')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, documentFactory, {
      swaggerOptions: {
        persistAuthorization: false,
      },
    });
  }

  // B5: enable NestJS shutdown hooks so PrismaService.$disconnect() is called on SIGTERM
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

function applySecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');

  const csp = [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    "style-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  next();
}

if (require.main === module) {
  void bootstrap();
}
