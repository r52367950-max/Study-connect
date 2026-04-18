/// <reference path="../src/types/express.d.ts" />
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra';

class PrismaServiceMock {
  user = {
    findFirst: async () => null,
    create: async () => ({ id: 'u-1', email: 'a@a.com', username: 'a', role: 'USER' as const }),
    findUnique: async () => null,
  };

  material = {
    findMany: async () => [],
    count: async () => 0,
  };
}

function assertStatus(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://frontend.local:3000';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(new PrismaServiceMock())
    .compile();

  const app = moduleRef.createNestApplication();
  app.enableCors({
    origin: ['http://frontend.local:3000'],
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    optionsSuccessStatus: 204,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.init();
  await app.listen(0);

  const server = app.getHttpServer();
  const address = server.address();
  const port = typeof address === 'string' ? 3000 : address.port;
  const base = `http://127.0.0.1:${port}`;
  const allowedOrigin = 'http://frontend.local:3000';
  const evilOrigin = 'http://evil.example';

  const csrfRes = await fetch(`${base}/auth/csrf`, {
    headers: { origin: allowedOrigin },
  });
  const csrfJson = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookie = (csrfRes.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  const missingTokenRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: { origin: allowedOrigin },
  });

  const mismatchTokenRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: {
      origin: allowedOrigin,
      cookie: csrfCookie,
      'x-csrf-token': `${csrfJson.csrfToken}-tampered`,
    },
  });

  const crossSiteRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: {
      origin: evilOrigin,
      cookie: csrfCookie,
      'x-csrf-token': csrfJson.csrfToken,
    },
  });

  const forgedRefererRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: {
      referer: `${evilOrigin}/attack`,
      cookie: csrfCookie,
      'x-csrf-token': csrfJson.csrfToken,
    },
  });

  const validLogoutRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: {
      origin: allowedOrigin,
      cookie: csrfCookie,
      'x-csrf-token': csrfJson.csrfToken,
    },
  });

  const crossSiteRatingRes = await fetch(`${base}/materials/m-1/ratings`, {
    method: 'POST',
    headers: {
      origin: evilOrigin,
      cookie: csrfCookie,
      'content-type': 'application/json',
      'x-csrf-token': csrfJson.csrfToken,
    },
    body: JSON.stringify({ score: 5, content: 'attack' }),
  });

  const crossSiteAdminRes = await fetch(`${base}/admin/materials/m-1/approve`, {
    method: 'POST',
    headers: {
      origin: evilOrigin,
      cookie: csrfCookie,
      'x-csrf-token': csrfJson.csrfToken,
    },
  });

  const preflightRes = await fetch(`${base}/auth/logout`, {
    method: 'OPTIONS',
    headers: {
      origin: allowedOrigin,
      'access-control-request-method': 'POST',
    },
  });

  assertStatus(missingTokenRes.status, 403, 'missing-token');
  assertStatus(mismatchTokenRes.status, 403, 'token-mismatch');
  assertStatus(crossSiteRes.status, 403, 'cross-site-origin');
  assertStatus(forgedRefererRes.status, 403, 'forged-referer');
  assertStatus(validLogoutRes.status, 201, 'valid-logout');
  assertStatus(crossSiteRatingRes.status, 403, 'cross-site-rating');
  assertStatus(crossSiteAdminRes.status, 403, 'cross-site-admin');
  assertStatus(preflightRes.status, 204, 'preflight');

  console.log('csrf regression checks passed');
  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
