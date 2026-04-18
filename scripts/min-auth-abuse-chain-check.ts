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

  material = {
    findMany: async () => [],
    count: async () => 0,
  };

  setUserRole(email: string, role: 'USER' | 'ADMIN'): void {
    const user = this.users.find((item) => item.email === email);
    if (user) {
      user.role = role;
    }
  }
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

  const prismaMock = new PrismaServiceMock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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

  const address = app.getHttpServer().address();
  const port = typeof address === 'string' ? 3000 : address.port;
  const base = `http://127.0.0.1:${port}`;

  const weakRegisterRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'weak@example.com', username: 'weak', password: '1234567' }),
  });

  const userRegisterRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', username: 'user', password: 'StrongPass123!' }),
  });

  const adminRegisterRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', username: 'admin', password: 'StrongPass123!' }),
  });
  prismaMock.setUserRole('admin@example.com', 'ADMIN');

  const bruteForceStatuses: number[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bruteRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: `WrongPass-${attempt}` }),
    });
    bruteForceStatuses.push(bruteRes.status);
  }

  const userLoginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: 'StrongPass123!' }),
  });

  const adminLoginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'StrongPass123!' }),
  });

  const userCookie = userLoginRes.headers.get('set-cookie') ?? '';
  const adminCookie = adminLoginRes.headers.get('set-cookie') ?? '';

  const abuseByUserRes = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
    headers: { cookie: userCookie },
  });

  const probeInvalidPageRes = await fetch(`${base}/admin/materials/pending?page=0&pageSize=1000`, {
    headers: { cookie: adminCookie },
  });

  const probeUnknownRes = await fetch(`${base}/admin/unknown-route`, {
    headers: { cookie: adminCookie },
  });
  const probeUnknownBody = await probeUnknownRes.text();

  assert(weakRegisterRes.status === 400, `weak password register should be 400, got ${weakRegisterRes.status}`);
  assert(userRegisterRes.status === 201, `normal user register should be 201, got ${userRegisterRes.status}`);
  assert(adminRegisterRes.status === 201, `admin register should be 201, got ${adminRegisterRes.status}`);
  assert(bruteForceStatuses.every((status) => status === 401), `all brute-force attempts should be 401, got ${bruteForceStatuses.join(',')}`);
  assert(userLoginRes.status === 201, `user login should be 201, got ${userLoginRes.status}`);
  assert(adminLoginRes.status === 201, `admin login should be 201, got ${adminLoginRes.status}`);
  assert(userCookie.toLowerCase().includes('httponly'), 'session cookie should include HttpOnly');
  assert(userCookie.toLowerCase().includes('samesite=lax'), 'session cookie should include SameSite=Lax');
  assert(abuseByUserRes.status === 403, `non-admin abuse request should be 403, got ${abuseByUserRes.status}`);
  assert(probeInvalidPageRes.status === 400, `invalid page/pageSize probe should be 400, got ${probeInvalidPageRes.status}`);
  assert(probeUnknownRes.status === 404, `unknown route probe should be 404, got ${probeUnknownRes.status}`);
  assert(!probeUnknownBody.toLowerCase().includes('prisma'), 'unknown route error should not expose implementation details');

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
