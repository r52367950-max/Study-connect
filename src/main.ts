import * as Sentry from '@sentry/node';
import { HttpStatus, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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

  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    const proxyValue = Number(trustProxy);
    (app as unknown as { set: (key: string, value: unknown) => void }).set(
      'trust proxy',
      Number.isFinite(proxyValue) && proxyValue > 0 ? proxyValue : trustProxy,
    );
  }

  if (process.env.AUTH_OTP_TEST_BYPASS === 'true') {
    app.get(Logger).warn('OTP test bypass is ACTIVE');
  }

  app.use(applySecurityHeaders);
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
