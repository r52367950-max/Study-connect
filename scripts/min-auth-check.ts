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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

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

  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'student@example.com',
      username: 'student',
      password: 'StrongPass123!',
    }),
  });

  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      username: 'admin',
      password: 'StrongPass123!',
    }),
  });

  prismaMock.setUserRole('admin@example.com', 'ADMIN');

  const loginUserRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'student@example.com', password: 'StrongPass123!' }),
  });
  const loginUserJson = (await loginUserRes.json()) as { user: { id: string } };
  const userCookie = loginUserRes.headers.get('set-cookie') ?? '';

  const loginAdminRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'StrongPass123!' }),
  });
  const loginAdminJson = (await loginAdminRes.json()) as { user: { id: string } };
  const adminCookie = loginAdminRes.headers.get('set-cookie') ?? '';

  const meRes = await fetch(`${base}/auth/me`, {
    headers: { cookie: userCookie },
  });

  const adminByUserRes = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
    headers: { cookie: userCookie },
  });

  const adminByAdminRes = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
    headers: { cookie: adminCookie },
  });

  const logoutRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: { cookie: userCookie },
  });

  const meAfterLogoutRes = await fetch(`${base}/auth/me`, {
    headers: { cookie: logoutRes.headers.get('set-cookie') ?? '' },
  });

  assert(loginUserRes.status === 201, `user login should be 201, got ${loginUserRes.status}`);
  assert(loginAdminRes.status === 201, `admin login should be 201, got ${loginAdminRes.status}`);
  assert(meRes.status === 200, `auth/me should be 200, got ${meRes.status}`);
  assert(logoutRes.status === 201, `logout should be 201, got ${logoutRes.status}`);
  assert(meAfterLogoutRes.status === 401, `auth/me after logout should be 401, got ${meAfterLogoutRes.status}`);
  assert(adminByUserRes.status === 403, `user should not access admin endpoint, got ${adminByUserRes.status}`);
  assert(adminByAdminRes.status === 200, `admin should access admin endpoint, got ${adminByAdminRes.status}`);
  assert(Boolean(loginUserJson.user?.id), 'user login should include user profile id');
  assert(Boolean(loginAdminJson.user?.id), 'admin login should include user profile id');
  assert(Boolean(userCookie), 'user login should set auth cookie');
  assert(Boolean(adminCookie), 'admin login should set auth cookie');

  await app.close();
}

run().catch(async (error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
