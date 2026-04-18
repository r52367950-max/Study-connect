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

    findUnique: async ({ where }: { where: { email: string } }) => {
      return this.users.find((user) => user.email === where.email) ?? null;
    },
  };

  setUserRole(email: string, role: 'USER' | 'ADMIN') {
    const user = this.users.find((item) => item.email === email);
    if (user) {
      user.role = role;
    }
  }

  material = {
    findMany: async () => [],
    count: async () => 0,
  };
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
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

  function getCookiePair(setCookieHeader: string | null): string {
    return (setCookieHeader ?? '').split(';')[0] ?? '';
  }

  async function issueCsrfCookie(existingCookies = ''): Promise<{ token: string; cookiePair: string }> {
    const csrfRes = await fetch(`${base}/auth/csrf`, {
      headers: {
        origin: allowedOrigin,
        ...(existingCookies ? { cookie: existingCookies } : {}),
      },
    });
    const json = (await csrfRes.json()) as { csrfToken: string };
    return {
      token: json.csrfToken,
      cookiePair: getCookiePair(csrfRes.headers.get('set-cookie')),
    };
  }

  const registerCsrf1 = await issueCsrfCookie();

  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: registerCsrf1.cookiePair,
      'x-csrf-token': registerCsrf1.token,
    },
    body: JSON.stringify({
      email: 'student@example.com',
      username: 'student',
      password: 'StrongPass123!',
    }),
  });

  const registerCsrf2 = await issueCsrfCookie();
  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: registerCsrf2.cookiePair,
      'x-csrf-token': registerCsrf2.token,
    },
    body: JSON.stringify({
      email: 'admin@example.com',
      username: 'admin',
      password: 'StrongPass123!',
    }),
  });

  prismaMock.setUserRole('admin@example.com', 'ADMIN');

  const loginUserCsrf = await issueCsrfCookie();
  const loginUserRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: loginUserCsrf.cookiePair,
      'x-csrf-token': loginUserCsrf.token,
    },
    body: JSON.stringify({ email: 'student@example.com', password: 'StrongPass123!' }),
  });
  const loginUserJson = (await loginUserRes.json()) as { user: { id: string } };
  const userCookie = getCookiePair(loginUserRes.headers.get('set-cookie'));

  const loginAdminCsrf = await issueCsrfCookie();
  const loginAdminRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: loginAdminCsrf.cookiePair,
      'x-csrf-token': loginAdminCsrf.token,
    },
    body: JSON.stringify({ email: 'admin@example.com', password: 'StrongPass123!' }),
  });
  const loginAdminJson = (await loginAdminRes.json()) as { user: { id: string } };
  const adminCookie = getCookiePair(loginAdminRes.headers.get('set-cookie'));

  const meRes = await fetch(`${base}/auth/me`, {
    headers: { cookie: userCookie },
  });

  const adminByUserRes = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
    headers: { cookie: userCookie },
  });

  const adminByAdminRes = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
    headers: { cookie: adminCookie },
  });

  const logoutCsrf = await issueCsrfCookie(userCookie);
  const logoutRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: {
      origin: allowedOrigin,
      cookie: `${userCookie}; ${logoutCsrf.cookiePair}`,
      'x-csrf-token': logoutCsrf.token,
    },
  });

  const meAfterLogoutRes = await fetch(`${base}/auth/me`, {
    headers: { cookie: logoutRes.headers.get('set-cookie') ?? '' },
  });

  console.log('user login status:', loginUserRes.status);
  console.log('admin login status:', loginAdminRes.status);
  console.log('me status:', meRes.status, 'body:', await meRes.text());
  console.log('logout status:', logoutRes.status);
  console.log('me after logout status:', meAfterLogoutRes.status, 'body:', await meAfterLogoutRes.text());
  console.log('admin by USER status:', adminByUserRes.status, 'body:', await adminByUserRes.text());
  console.log('admin by ADMIN status:', adminByAdminRes.status, 'body:', await adminByAdminRes.text());
  console.log('user login has user profile:', Boolean(loginUserJson.user?.id));
  console.log('admin login has user profile:', Boolean(loginAdminJson.user?.id));
  console.log('user cookie set:', Boolean(userCookie));
  console.log('admin cookie set:', Boolean(adminCookie));

  await app.close();
}

run().catch(async (error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
