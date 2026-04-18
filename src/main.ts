import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response, NextFunction } from 'express';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppModule } from './app.module';

function applySecurityHeaders(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none';",
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (request.secure) {
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

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

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) ?? true,
    credentials: true,
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

void bootstrap();
