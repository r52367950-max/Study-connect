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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(): Promise<void> {
  process.env.JWT_SECRET = 'test-secret';
  process.env.RATE_LIMIT_GLOBAL_LIMIT = '1000';
  process.env.RATE_LIMIT_LOGIN_LIMIT = '100';
  process.env.RATE_LIMIT_LOGIN_MAX_FAILURES = '3';
  process.env.RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS = '1000';
  process.env.RATE_LIMIT_LOGIN_LOCK_MS = '1200';

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
      email: 'admin@example.com',
      username: 'admin',
      password: 'StrongPass123!',
    }),
  });

  prismaMock.setUserRole('admin@example.com', 'ADMIN');

  let lockTriggeredStatus = 0;
  for (let i = 0; i < 4; i += 1) {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'wrong-pass' }),
    });
    lockTriggeredStatus = res.status;
  }

  await sleep(1300);

  const loginAdminRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'StrongPass123!' }),
  });

  const adminCookie = loginAdminRes.headers.get('set-cookie') ?? '';

  let adminRateLimitedStatus = 0;
  for (let i = 0; i < 35; i += 1) {
    const res = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
      headers: { cookie: adminCookie },
    });
    adminRateLimitedStatus = res.status;
    if (res.status === 429) {
      break;
    }
  }

  console.log('login lock status (expected 429):', lockTriggeredStatus);
  console.log('login status after cooldown (expected 200):', loginAdminRes.status);
  console.log('admin burst limited status (expected 429):', adminRateLimitedStatus);

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
