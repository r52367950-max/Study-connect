/// <reference path="../src/types/express.d.ts" />
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { APP_GUARD_CHAIN, AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra';

type HttpMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type WriteRouteCase = {
  readonly method: HttpMethod;
  readonly templatePath: string;
  readonly resolvedPath: string;
  readonly init?: {
    readonly headers?: Record<string, string>;
    readonly body?: string;
  };
};

const CONTROLLER_FILES = [
  'src/modules/auth/auth.controller.ts',
  'src/modules/auth/otp/otp.controller.ts',
  'src/modules/materials/materials.controller.ts',
  'src/modules/admin/admin.controller.ts',
  'src/modules/users/users.controller.ts',
  'src/modules/view-events/view-events.controller.ts',
  'src/modules/favorites/favorites.controller.ts',
] as const;

const EXPECTED_WRITE_ROUTES = [
  'DELETE /favorites/:materialId',
  'POST /admin/materials/:id/approve',
  'POST /admin/materials/:id/offline',
  'POST /admin/materials/:id/reject',
  'POST /admin/users/:id/ban',
  'POST /auth/change-password',
  'POST /auth/login',
  'POST /auth/logout',
  'POST /auth/otp/send',
  'POST /auth/refresh',
  'POST /auth/register',
  'POST /favorites/:materialId',
  'POST /materials',
  'POST /materials/:id/ratings',
  'POST /view-events',
  'PUT /users/me/profile',
] as const;

const WRITE_ROUTE_CASES: WriteRouteCase[] = [
  {
    method: 'POST',
    templatePath: '/auth/register',
    resolvedPath: '/auth/register',
    init: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@a.com', username: 'a', password: 'Aa123456!', otpCode: '000000' }),
    },
  },
  {
    method: 'POST',
    templatePath: '/auth/login',
    resolvedPath: '/auth/login',
    init: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@a.com', password: 'Aa123456!' }),
    },
  },
  {
    method: 'POST',
    templatePath: '/auth/refresh',
    resolvedPath: '/auth/refresh',
  },
  {
    method: 'POST',
    templatePath: '/auth/logout',
    resolvedPath: '/auth/logout',
  },
  {
    method: 'POST',
    templatePath: '/auth/change-password',
    resolvedPath: '/auth/change-password',
    init: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'Aa123456!', newPassword: 'Bb234567!' }),
    },
  },
  {
    method: 'POST',
    templatePath: '/materials/:id/ratings',
    resolvedPath: '/materials/m-1/ratings',
    init: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ score: 5, content: 'attack' }),
    },
  },
  {
    method: 'POST',
    templatePath: '/materials',
    resolvedPath: '/materials',
  },
  {
    method: 'POST',
    templatePath: '/admin/materials/:id/approve',
    resolvedPath: '/admin/materials/m-1/approve',
  },
  {
    method: 'POST',
    templatePath: '/admin/materials/:id/offline',
    resolvedPath: '/admin/materials/m-1/offline',
    init: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewComment: 'offline' }),
    },
  },
  {
    method: 'POST',
    templatePath: '/admin/materials/:id/reject',
    resolvedPath: '/admin/materials/m-1/reject',
    init: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'invalid' }),
    },
  },
  {
    method: 'POST',
    templatePath: '/admin/users/:id/ban',
    resolvedPath: '/admin/users/u-1/ban',
    init: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    },
  },
  {
    method: 'POST',
    templatePath: '/auth/otp/send',
    resolvedPath: '/auth/otp/send',
    init: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'email', email: 'a@a.com', purpose: 'LOGIN' }),
    },
  },
  {
    method: 'PUT',
    templatePath: '/users/me/profile',
    resolvedPath: '/users/me/profile',
    init: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    },
  },
  {
    method: 'POST',
    templatePath: '/view-events',
    resolvedPath: '/view-events',
    init: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ materialId: '00000000-0000-0000-0000-000000000000', kind: 'IMPRESSION' }),
    },
  },
  {
    method: 'POST',
    templatePath: '/favorites/:materialId',
    resolvedPath: '/favorites/00000000-0000-0000-0000-000000000000',
  },
  {
    method: 'DELETE',
    templatePath: '/favorites/:materialId',
    resolvedPath: '/favorites/00000000-0000-0000-0000-000000000000',
  },
];

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

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function discoverStateChangingRoutes(): Promise<string[]> {
  const routes: string[] = [];
  // Accept both quote styles — Prettier leaves some controllers double-quoted,
  // and a single-quote-only regex silently dropped those files' write routes.
  const methodRegex = /@(Post|Put|Patch|Delete)\((?:'([^']*)'|"([^"]*)")?\)/g;

  for (const relativePath of CONTROLLER_FILES) {
    const fileContent = await readFile(resolve(process.cwd(), relativePath), 'utf8');
    const controllerMatch = fileContent.match(/@Controller\((?:'([^']*)'|"([^"]*)")\)/);
    if (!controllerMatch) {
      throw new Error(`csrf-regression: no @Controller() prefix found in ${relativePath}`);
    }

    const controllerPrefix = controllerMatch[1] ?? controllerMatch[2];
    for (const match of fileContent.matchAll(methodRegex)) {
      const method = match[1].toUpperCase() as HttpMethod;
      const subPath = match[2] ?? match[3] ?? '';
      const fullPath = normalizePath(controllerPrefix, subPath);
      routes.push(`${method} ${fullPath}`);
    }
  }

  return routes.sort();
}

function normalizePath(controllerPrefix: string, subPath: string): string {
  const cleanPrefix = controllerPrefix.replace(/^\/+|\/+$/g, '');
  const cleanSubPath = subPath.replace(/^\/+|\/+$/g, '');

  if (!cleanPrefix && !cleanSubPath) {
    return '/';
  }
  if (!cleanSubPath) {
    return `/${cleanPrefix}`;
  }
  if (!cleanPrefix) {
    return `/${cleanSubPath}`;
  }

  return `/${cleanPrefix}/${cleanSubPath}`;
}

function assertRouteCoverage(discoveredRoutes: string[]): void {
  const expected = [...EXPECTED_WRITE_ROUTES].sort();
  assertEqual(discoveredRoutes.length, expected.length, 'write-route-count');

  discoveredRoutes.forEach((route, index) => {
    assertEqual(route, expected[index], `write-route-match-${index}`);
  });

  const coveredTemplates = WRITE_ROUTE_CASES.map((item) => `${item.method} ${item.templatePath}`).sort();
  coveredTemplates.forEach((route, index) => {
    assertEqual(route, expected[index], `write-route-coverage-${index}`);
  });
}

function assertAppGuardOrder(): void {
  const providers = (Reflect.getMetadata('providers', AppModule) as Array<
    | { provide?: unknown; useClass?: { name?: string } }
    | undefined
  >) ?? [];

  const guardChain = providers
    .filter((provider) => provider?.provide === APP_GUARD)
    .map((provider) => provider?.useClass?.name)
    .filter((name): name is string => typeof name === 'string');

  const expected = APP_GUARD_CHAIN.map((guardClass) => guardClass.name);
  assertEqual(guardChain.length, expected.length, 'app-guard-count');

  guardChain.forEach((guardName, index) => {
    assertEqual(guardName, expected[index], `app-guard-order-${index}`);
  });
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

  process.env.AUTH_OTP_TEST_BYPASS = process.env.AUTH_OTP_TEST_BYPASS ?? 'true';
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://frontend.local:3000';

  assertAppGuardOrder();
  const discoveredRoutes = await discoverStateChangingRoutes();
  assertRouteCoverage(discoveredRoutes);

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
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
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

  for (const routeCase of WRITE_ROUTE_CASES) {
    const routeLabel = `${routeCase.method} ${routeCase.templatePath}`;

    const missingTokenRes = await fetch(`${base}${routeCase.resolvedPath}`, {
      method: routeCase.method,
      headers: {
        origin: allowedOrigin,
        ...(routeCase.init?.headers ?? {}),
      },
      body: routeCase.init?.body,
    });

    const forgedTokenRes = await fetch(`${base}${routeCase.resolvedPath}`, {
      method: routeCase.method,
      headers: {
        origin: allowedOrigin,
        cookie: csrfCookie,
        'x-csrf-token': `${csrfJson.csrfToken}-tampered`,
        ...(routeCase.init?.headers ?? {}),
      },
      body: routeCase.init?.body,
    });

    const crossSiteRes = await fetch(`${base}${routeCase.resolvedPath}`, {
      method: routeCase.method,
      headers: {
        origin: evilOrigin,
        cookie: csrfCookie,
        'x-csrf-token': csrfJson.csrfToken,
        ...(routeCase.init?.headers ?? {}),
      },
      body: routeCase.init?.body,
    });

    assertStatus(missingTokenRes.status, 403, `${routeLabel}-missing-token`);
    assertStatus(forgedTokenRes.status, 403, `${routeLabel}-forged-token`);
    assertStatus(crossSiteRes.status, 403, `${routeLabel}-cross-site-origin`);
  }

  const validLogoutRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: {
      origin: allowedOrigin,
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

  const preflightRes = await fetch(`${base}/auth/logout`, {
    method: 'OPTIONS',
    headers: {
      origin: allowedOrigin,
      'access-control-request-method': 'POST',
    },
  });

  const publicReadRes = await fetch(`${base}/materials`, {
    method: 'GET',
    headers: {
      origin: evilOrigin,
    },
  });

  assertStatus(validLogoutRes.status, 201, 'valid-logout');
  assertStatus(forgedRefererRes.status, 403, 'forged-referer');
  assertStatus(preflightRes.status, 204, 'preflight');
  assertStatus(publicReadRes.status, 200, 'public-read-allowed');

  console.log('csrf regression checks passed');
  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  // Force-exit: a failed run may still hold the Nest HTTP server open,
  // which would hang the runner/CI instead of failing fast.
  process.exit(1);
});
