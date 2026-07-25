/// <reference path="../src/types/express.d.ts" />
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra';
import { matchesUserWhere } from './support/user-where-match';

type DbUser = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'BANNED';
  tokenVersion: number;
};

class PrismaServiceMock {
  private users: DbUser[] = [];
  readonly auditLogs: Array<Record<string, unknown>> = [];

  // AdminService.banUser writes the ban and its audit-log entry in one
  // interactive transaction, so the mock has to expose both.
  $transaction = async <T>(task: (tx: this) => Promise<T>): Promise<T> => task(this);

  adminAuditLog = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.auditLogs.push(data);
      return data;
    },
  };

  user = {
    findFirst: async ({ where }: { where: unknown }) => {
      return this.users.find((user) => matchesUserWhere(user, where)) ?? null;
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
        status: 'ACTIVE',
        tokenVersion: 0,
      };
      this.users.push(user);

      return {
        ...(select.id ? { id: user.id } : {}),
        ...(select.email ? { email: user.email } : {}),
        ...(select.username ? { username: user.username } : {}),
        ...(select.role ? { role: user.role } : {}),
      };
    },

    findUnique: async ({
      where,
      select,
    }: {
      where: { email?: string; id?: string };
      select?: Record<string, boolean>;
    }) => {
      const user = this.users.find((item) =>
        (where.email ? item.email === where.email : false) || (where.id ? item.id === where.id : false),
      );
      if (!user) {
        return null;
      }
      if (!select) {
        return user;
      }
      const selected: Record<string, unknown> = {};
      for (const [key, enabled] of Object.entries(select)) {
        if (enabled) {
          selected[key] = user[key as keyof DbUser];
        }
      }
      return selected;
    },

    update: async ({
      where,
      data,
      select,
    }: {
      where: { id: string };
      data: {
        passwordHash?: string;
        tokenVersion?: { increment: number };
        status?: 'ACTIVE' | 'BANNED';
      };
      select?: Record<string, boolean>;
    }) => {
      const user = this.users.find((item) => item.id === where.id);
      if (!user) {
        throw new Error('user not found');
      }
      if (typeof data.passwordHash === 'string') {
        user.passwordHash = data.passwordHash;
      }
      if (data.status) {
        user.status = data.status;
      }
      if (data.tokenVersion?.increment) {
        user.tokenVersion += data.tokenVersion.increment;
      }
      if (!select) {
        return user;
      }
      const selected: Record<string, unknown> = {};
      for (const [key, enabled] of Object.entries(select)) {
        if (enabled) {
          selected[key] = user[key as keyof DbUser];
        }
      }
      return selected;
    },
  };

  material = {
    findMany: async () => [],
    count: async () => 0,
  };
}

function getCookiePair(setCookieHeader: string | null): string {
  return (setCookieHeader ?? '').split(';')[0] ?? '';
}

function extractCookie(setCookie: string, key: string): string {
  const pair = setCookie
    .split(',')
    .map((item) => item.trim())
    .map((item) => item.split(';')[0] ?? '')
    .find((item) => item.startsWith(`${key}=`));

  return pair ?? '';
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

  const registerCsrf = await issueCsrfCookie();
  await fetch(`${base}/auth/register`, {
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

  const loginCsrf1 = await issueCsrfCookie();
  const login1 = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: loginCsrf1.cookiePair,
      'x-csrf-token': loginCsrf1.token,
    },
    body: JSON.stringify({ email: 'student@example.com', password: 'StrongPass123!' }),
  });
  const cookie1 = extractCookie(login1.headers.get('set-cookie') ?? '', 'auth-token');
  const login1User = (await login1.json()) as { user: { id: string } };

  const logoutCsrf = await issueCsrfCookie(cookie1);
  const logoutRes = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: {
      origin: allowedOrigin,
      cookie: `${cookie1}; ${logoutCsrf.cookiePair}`,
      'x-csrf-token': logoutCsrf.token,
    },
  });
  const meByOldTokenAfterLogout = await fetch(`${base}/auth/me`, {
    headers: { cookie: cookie1 },
  });

  const loginCsrf2 = await issueCsrfCookie();
  const login2 = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: loginCsrf2.cookiePair,
      'x-csrf-token': loginCsrf2.token,
    },
    body: JSON.stringify({ email: 'student@example.com', password: 'StrongPass123!' }),
  });
  const cookie2 = extractCookie(login2.headers.get('set-cookie') ?? '', 'auth-token');

  const changePwdCsrf = await issueCsrfCookie(cookie2);
  const changePwdRes = await fetch(`${base}/auth/change-password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: `${cookie2}; ${changePwdCsrf.cookiePair}`,
      'x-csrf-token': changePwdCsrf.token,
    },
    body: JSON.stringify({
      currentPassword: 'StrongPass123!',
      newPassword: 'NewStrongPass456!',
    }),
  });
  const meByOldTokenAfterPasswordChange = await fetch(`${base}/auth/me`, {
    headers: { cookie: cookie2 },
  });

  const loginCsrfOldPwd = await issueCsrfCookie();
  const oldPwdLoginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: loginCsrfOldPwd.cookiePair,
      'x-csrf-token': loginCsrfOldPwd.token,
    },
    body: JSON.stringify({ email: 'student@example.com', password: 'StrongPass123!' }),
  });

  const loginCsrfNewPwd = await issueCsrfCookie();
  const newPwdLoginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: loginCsrfNewPwd.cookiePair,
      'x-csrf-token': loginCsrfNewPwd.token,
    },
    body: JSON.stringify({ email: 'student@example.com', password: 'NewStrongPass456!' }),
  });
  const cookie3 = extractCookie(newPwdLoginRes.headers.get('set-cookie') ?? '', 'auth-token');

  const adminRegisterCsrf = await issueCsrfCookie();
  await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: adminRegisterCsrf.cookiePair,
      'x-csrf-token': adminRegisterCsrf.token,
    },
    body: JSON.stringify({
      email: 'admin@example.com',
      username: 'admin',
      password: 'StrongPass123!',
      otpCode: '000000',
    }),
  });
  const admin = (await prismaMock.user.findUnique({ where: { email: 'admin@example.com' } })) as DbUser;
  admin.role = 'ADMIN';

  const adminLoginCsrf = await issueCsrfCookie();
  const adminLoginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: allowedOrigin,
      cookie: adminLoginCsrf.cookiePair,
      'x-csrf-token': adminLoginCsrf.token,
    },
    body: JSON.stringify({ email: 'admin@example.com', password: 'StrongPass123!' }),
  });
  const adminCookie = extractCookie(adminLoginRes.headers.get('set-cookie') ?? '', 'auth-token');

  const banCsrf = await issueCsrfCookie(adminCookie);
  const banRes = await fetch(`${base}/admin/users/${login1User.user.id}/ban`, {
    method: 'POST',
    headers: {
      origin: allowedOrigin,
      cookie: `${adminCookie}; ${banCsrf.cookiePair}`,
      'x-csrf-token': banCsrf.token,
    },
  });

  const meByOldTokenAfterBan = await fetch(`${base}/auth/me`, {
    headers: { cookie: cookie3 },
  });

  console.log('logout status:', logoutRes.status);
  console.log('me by old token after logout (expected 401):', meByOldTokenAfterLogout.status);
  console.log('change password status:', changePwdRes.status);
  console.log('me by old token after password change (expected 401):', meByOldTokenAfterPasswordChange.status);
  console.log('old password login status (expected 401):', oldPwdLoginRes.status);
  console.log('new password login status (expected 200):', newPwdLoginRes.status);
  console.log('ban status:', banRes.status);
  console.log('me by old token after ban (expected 401):', meByOldTokenAfterBan.status);

  try {
    if (meByOldTokenAfterLogout.status !== 401) {
      throw new Error('old token should be invalid immediately after logout');
    }
    if (meByOldTokenAfterPasswordChange.status !== 401) {
      throw new Error('old token should be invalid immediately after password change');
    }
    if (oldPwdLoginRes.status !== 401 || newPwdLoginRes.status !== 200) {
      throw new Error('password rotation login assertions failed');
    }
    if (banRes.status !== 201 || meByOldTokenAfterBan.status !== 401) {
      throw new Error('ban should invalidate existing user token immediately');
    }
    if (prismaMock.auditLogs.at(-1)?.action !== 'USER_BAN') {
      throw new Error('ban should write a USER_BAN audit log entry');
    }
    console.log('min-auth-session-invalidation-check passed');
  } finally {
    // Always tear the server down: without this a failed assertion leaves the
    // listener open, the event loop never drains, and the run hangs instead of
    // reporting the failure (a hung CI job hides the actual error).
    await app.close();
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
