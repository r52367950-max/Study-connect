/// <reference path="../src/types/express.d.ts" />
import { INestApplication, ValidationPipe } from '@nestjs/common';
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
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(new PrismaServiceMock())
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

  const registerRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'student@example.com',
      username: 'student',
      password: 'StrongPass123!',
    }),
  });
  const registerJson = (await registerRes.json()) as { accessToken: string };

  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'student@example.com',
      password: 'StrongPass123!',
    }),
  });
  const loginJson = (await loginRes.json()) as { accessToken: string };

  const meRes = await fetch(`${base}/auth/me`, {
    headers: {
      authorization: `Bearer ${loginJson.accessToken}`,
    },
  });
  const meBody = await meRes.text();

  const adminRes = await fetch(`${base}/admin/ping`, {
    headers: {
      authorization: `Bearer ${loginJson.accessToken}`,
    },
  });
  const adminBody = await adminRes.text();

  console.log('register status:', registerRes.status);
  console.log('login status:', loginRes.status);
  console.log('me status:', meRes.status, 'body:', meBody);
  console.log('admin status:', adminRes.status, 'body:', adminBody);
  console.log('register token exists:', Boolean(registerJson.accessToken));
  console.log('login token exists:', Boolean(loginJson.accessToken));

  await app.close();
}

run().catch(async (error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
