import { ValidationPipe } from '@nestjs/common';
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


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(applySecurityHeaders);
  app.useGlobalFilters(new HttpExceptionFilter(isProduction));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      disableErrorMessages: isProduction,
    }),
  );

  const allowedOrigins = parseAllowedCorsOrigins();
  assertCorsConfigInProduction(allowedOrigins, isProduction);

  app.enableCors({
    origin: createCorsOriginDelegate(allowedOrigins),
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
