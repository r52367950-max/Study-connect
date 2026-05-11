/// <reference path="../src/types/express.d.ts" />
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra';

type DbUser = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: 'USER' | 'ADMIN';
};

class PrismaServiceMock {
  private users: DbUser[] = [];

  user = {
    findFirst: async ({ where }: { where: { OR: Array<{ email?: string; username?: string }> } }) => {
      const found = this.users.find((user) =>
        where.OR.some((cond) => cond.email === user.email || cond.username === user.username),
      );
      return found ?? null;
    },

    create: async ({
      data,
      select,
    }: {
      data: { email: string; username: string; passwordHash: string; role: 'USER' | 'ADMIN' };
      select: { id?: boolean; email?: boolean; username?: boolean; role?: boolean };
    }) => {
      const user: DbUser = {
        id: crypto.randomUUID(),
        email: data.email,
        username: data.username,
        passwordHash: data.passwordHash,
        role: data.role,
      };
      this.users.push(user);

      return {
        ...(select.id ? { id: user.id } : {}),
        ...(select.email ? { email: user.email } : {}),
        ...(select.username ? { username: user.username } : {}),
        ...(select.role ? { role: user.role } : {}),
      };
    },

    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      return this.users.find((user) =>
        (where.email !== undefined && user.email === where.email) ||
        (where.id !== undefined && user.id === where.id),
      ) ?? null;
    },
  };

  material = {
    findMany: async () => [],
    count: async () => 0,
  };
}

function extractAuthToken(cookie: string): string {
  const pair = cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('auth-token='));

  if (!pair) {
    throw new Error('Auth cookie not found');
  }

  return decodeURIComponent(pair.replace('auth-token=', ''));
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

  process.env.AUTH_OTP_TEST_BYPASS = process.env.AUTH_OTP_TEST_BYPASS ?? 'true';
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://frontend.local:3000';

  const prismaMock = new PrismaServiceMock();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .compile();

  const app = moduleRef.createNestApplication();
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
  const issueCsrf = async (): Promise<{ token: string; cookiePair: string }> => {
    const csrfRes = await fetch(`${base}/auth/csrf`, {
      headers: { origin: allowedOrigin },
    });
    const csrfBody = (await csrfRes.json()) as { csrfToken: string };
    return {
      token: csrfBody.csrfToken,
      cookiePair: (csrfRes.headers.get('set-cookie') ?? '').split(';')[0] ?? '',
    };
  };

  const registerCsrf = await issueCsrf();

  const registerRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: registerCsrf.cookiePair,
      'x-csrf-token': registerCsrf.token,
    },
    body: JSON.stringify({
      email: 'student@example.com',
      username: 'student',
      password: 'StrongPass123!',
      otpCode: '000000',
    }),
  });
  if (registerRes.status !== 201) {
    throw new Error(`register expected 201, got ${registerRes.status}`);
  }

  const loginCsrf = await issueCsrf();

  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: loginCsrf.cookiePair,
      'x-csrf-token': loginCsrf.token,
    },
    body: JSON.stringify({ email: 'student@example.com', password: 'StrongPass123!' }),
  });
  if (loginRes.status !== 200) {
    throw new Error(`login expected 200, got ${loginRes.status}`);
  }

  const setCookie = loginRes.headers.get('set-cookie') ?? '';
  const validToken = extractAuthToken(setCookie);

  const missingTokenRes = await fetch(`${base}/auth/me`);
  if (missingTokenRes.status !== 401) {
    throw new Error(`missing token expected 401, got ${missingTokenRes.status}`);
  }

  const malformedToken = 'not-a-jwt-token';
  const truncatedToken = validToken.split('.').slice(0, 2).join('.');
  const [header, payload] = validToken.split('.');
  const illegalSignatureToken = `${header}.${payload}.forged-signature`;

  const cases = [
    { name: 'malformed token', token: malformedToken },
    { name: 'truncated token', token: truncatedToken },
    { name: 'illegal signature token', token: illegalSignatureToken },
  ];

  for (const item of cases) {
    const res = await fetch(`${base}/auth/me`, {
      headers: {
        cookie: `auth-token=${encodeURIComponent(item.token)}`,
      },
    });

    const bodyText = await res.text();
    const has500Leak = res.status === 500 || bodyText.includes('InternalServerErrorException');

    console.log(`${item.name} status:`, res.status);
    console.log(`${item.name} leak check:`, has500Leak ? 'FAILED' : 'PASSED');

    if (res.status !== 401 || has500Leak) {
      throw new Error(`${item.name} expected 401 without internal leak`);
    }
  }

  const validTokenRes = await fetch(`${base}/auth/me`, {
    headers: {
      cookie: `auth-token=${encodeURIComponent(validToken)}`,
    },
  });

  console.log('valid token status:', validTokenRes.status);
  if (validTokenRes.status !== 200) {
    throw new Error('valid token should remain accepted');
  }

  const logoutCsrf = await issueCsrf();

  const forgedCsrfRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: {
      origin: allowedOrigin,
      cookie: `auth-token=${encodeURIComponent(validToken)}; ${logoutCsrf.cookiePair}`,
      'x-csrf-token': `${logoutCsrf.token}-forged`,
    },
  });
  if (forgedCsrfRes.status !== 403) {
    throw new Error(`forged csrf token expected 403, got ${forgedCsrfRes.status}`);
  }

  const crossSiteRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: {
      origin: evilOrigin,
      cookie: `auth-token=${encodeURIComponent(validToken)}; ${logoutCsrf.cookiePair}`,
      'x-csrf-token': logoutCsrf.token,
    },
  });
  if (crossSiteRes.status !== 403) {
    throw new Error(`cross-site logout expected 403, got ${crossSiteRes.status}`);
  }

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
