/// <reference path="../src/types/express.d.ts" />
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { RateLimitService } from '../src/common/rate-limit.service';
import { MinioService, PrismaService } from '../src/infra';
import { AuthService } from '../src/modules/auth/auth.service';

type UserRole = 'USER' | 'ADMIN';
type MaterialStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'OFFLINE';

type DbUser = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: 'ACTIVE' | 'BANNED';
  tokenVersion: number;
};

type DbMaterial = {
  id: string;
  title: string;
  description: string | null;
  stage: string | null;
  grade: string | null;
  subject: string | null;
  year: number | null;
  region: string | null;
  fileKey: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  status: MaterialStatus;
  reviewComment: string | null;
  uploaderId: string;
  createdAt: Date;
  updatedAt: Date;
};

class PrismaServiceMock {
  private users: DbUser[] = [];
  private materials: DbMaterial[] = [];

  user = {
    findFirst: async ({ where }: { where: { OR: Array<{ email?: string; username?: string }> } }) => {
      return (
        this.users.find((user) =>
          where.OR.some((cond) => cond.email === user.email || cond.username === user.username),
        ) ?? null
      );
    },

    create: async ({
      data,
      select,
    }: {
      data: { email?: string | null; phone?: string | null; username: string; passwordHash: string; role: UserRole };
      select: { id?: boolean; email?: boolean; username?: boolean; role?: boolean };
    }) => {
      const user: DbUser = {
        id: crypto.randomUUID(),
        email: data.email ?? '',
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

    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      return this.users.find((user) =>
        (where.email !== undefined && user.email === where.email) ||
        (where.id !== undefined && user.id === where.id),
      ) ?? null;
    },
  };

  material = {
    create: async ({
      data,
      select,
    }: {
      data: {
        title: string;
        description?: string;
        stage?: string;
        grade?: string;
        subject?: string;
        year?: number;
        region?: string;
        fileKey: string;
        visibility: 'PUBLIC' | 'PRIVATE';
        status: MaterialStatus;
        reviewComment?: string;
        uploaderId: string;
      };
      select: Record<string, boolean>;
    }) => {
      const now = new Date();
      const material: DbMaterial = {
        id: crypto.randomUUID(),
        title: data.title,
        description: data.description ?? null,
        stage: data.stage ?? null,
        grade: data.grade ?? null,
        subject: data.subject ?? null,
        year: data.year ?? null,
        region: data.region ?? null,
        fileKey: data.fileKey,
        visibility: data.visibility,
        status: data.status,
        reviewComment: data.reviewComment ?? null,
        uploaderId: data.uploaderId,
        createdAt: now,
        updatedAt: now,
      };
      this.materials.push(material);
      return this.pick(material, select);
    },

    findMany: async ({
      where,
      orderBy,
      skip,
      take,
      select,
    }: {
      where: { status: MaterialStatus };
      orderBy: { createdAt: 'desc' | 'asc' };
      skip: number;
      take: number;
      select: Record<string, boolean>;
    }) => {
      const filtered = this.materials.filter((material) => material.status === where.status);
      const ordered = [...filtered].sort((a, b) =>
        orderBy.createdAt === 'desc'
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime(),
      );
      return ordered.slice(skip, skip + take).map((material) => this.pick(material, select));
    },

    count: async ({ where }: { where: { status: MaterialStatus } }) => {
      return this.materials.filter((material) => material.status === where.status).length;
    },

    findFirst: async ({ where, select }: { where: { id: string; status: MaterialStatus; visibility: 'PUBLIC' | 'PRIVATE' }; select: Record<string, boolean> }) => {
      const found = this.materials.find(
        (material) =>
          material.id === where.id && material.status === where.status && material.visibility === where.visibility,
      );
      if (!found) {
        return null;
      }
      return this.pick(found, select);
    },

    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const idx = this.materials.findIndex((m) => m.id === where.id);
      if (idx >= 0) {
        this.materials[idx] = { ...this.materials[idx], ...(data as Partial<DbMaterial>) };
        return this.materials[idx];
      }
      return null;
    },
  };

  setUserRole(email: string, role: UserRole): void {
    const user = this.users.find((item) => item.email === email);
    if (user) {
      user.role = role;
    }
  }

  findUserByEmail(email: string): DbUser | undefined {
    return this.users.find((item) => item.email === email);
  }

  seedApprovedMaterial(input: { uploaderEmail: string; title: string; visibility: 'PUBLIC' | 'PRIVATE' }): string {
    const uploader = this.users.find((item) => item.email === input.uploaderEmail);
    if (!uploader) {
      throw new Error('uploader user not found');
    }

    const now = new Date();
    const material: DbMaterial = {
      id: crypto.randomUUID(),
      title: input.title,
      description: 'seed material',
      stage: null,
      grade: null,
      subject: null,
      year: null,
      region: null,
      fileKey: `${crypto.randomUUID()}.txt`,
      visibility: input.visibility,
      status: 'APPROVED',
      reviewComment: 'approved',
      uploaderId: uploader.id,
      createdAt: now,
      updatedAt: now,
    };

    this.materials.push(material);
    return material.id;
  }

  private pick(material: DbMaterial, select: Record<string, boolean>) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) {
      if (select[key]) {
        out[key] = (material as Record<string, unknown>)[key];
      }
    }
    return out;
  }
}

class MinioServiceMock {
  private readonly objects = new Map<string, Buffer>();

  async uploadObject(key: string, payload: Buffer): Promise<string> {
    this.objects.set(key, payload);
    return `study-connect/${key}`;
  }

  async getPresignedDownloadUrl(key: string): Promise<string> {
    return `https://minio.local/${key}`;
  }
}

type RateLimitLogEvent = {
  event: 'rate_limit_blocked' | 'rate_limit_metric';
  ts: string;
  rule?: string;
  key?: string;
  route?: string;
  method?: string;
  ip?: string;
  retryAfterMs?: number;
  metric?: string;
  value?: number;
};

function readCookiePair(setCookieHeader: string | null, cookieName: string): string {
  if (!setCookieHeader) {
    return '';
  }

  const segment = setCookieHeader
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieName}=`));

  if (!segment) {
    return '';
  }

  return segment.split(';')[0] ?? '';
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = 'rate-limit-test-secret';
  process.env.AUTH_OTP_TEST_BYPASS = process.env.AUTH_OTP_TEST_BYPASS ?? 'true';
  process.env.CORS_ORIGIN = 'http://frontend.local:3000';

  process.env.RATE_LIMIT_GLOBAL_LIMIT = '999';
  process.env.RATE_LIMIT_LOGIN_LIMIT = '3';
  process.env.RATE_LIMIT_LOGIN_WINDOW_MS = '60000';
  process.env.RATE_LIMIT_LOGIN_MAX_FAILURES = '3';
  process.env.RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS = '1200';
  process.env.RATE_LIMIT_LOGIN_LOCK_MS = '1500';

  process.env.MAX_UPLOAD_SIZE_MB = '50';

  const prismaMock = new PrismaServiceMock();
  const minioMock = new MinioServiceMock();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(MinioService)
    .useValue(minioMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  await app.init();
  await app.listen(0);

  const rateLimitService = app.get(RateLimitService) as RateLimitService & {
    logger?: { warn: (message: string) => void; log: (message: string) => void };
  };
  const capturedLogs: RateLimitLogEvent[] = [];
  rateLimitService.logger = {
    warn(message: string) {
      const parsed = parseRateLimitLog(message);
      if (parsed) {
        capturedLogs.push(parsed);
      }
    },
    log(message: string) {
      const parsed = parseRateLimitLog(message);
      if (parsed) {
        capturedLogs.push(parsed);
      }
    },
  };

  const address = app.getHttpServer().address();
  const port = typeof address === 'string' ? 3000 : address.port;
  const base = `http://127.0.0.1:${port}`;

  async function issueCsrfCookie(existingCookies = ''): Promise<{ token: string; cookiePair: string }> {
    const csrfRes = await fetch(`${base}/auth/csrf`, {
      headers: {
        origin: 'http://frontend.local:3000',
        ...(existingCookies ? { cookie: existingCookies } : {}),
      },
    });
    const body = (await csrfRes.json()) as { csrfToken: string };
    return {
      token: body.csrfToken,
      cookiePair: readCookiePair(csrfRes.headers.get('set-cookie'), 'csrf-token'),
    };
  }

  async function registerUser(
    input: { email: string; username: string; password: string; otpCode?: string },
  ): Promise<{ authCookie: string }> {
    const csrf = await issueCsrfCookie();
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: {
        origin: 'http://frontend.local:3000',
        'content-type': 'application/json',
        cookie: csrf.cookiePair,
        'x-csrf-token': csrf.token,
      },
      body: JSON.stringify(input),
    });

    if (res.status !== 201) {
      throw new Error(`register ${input.email} failed, status=${res.status}, body=${await res.text()}`);
    }

    return {
      authCookie: readCookiePair(res.headers.get('set-cookie'), 'auth-token'),
    };
  }

  await registerUser({ email: 'admin@example.com', username: 'admin', password: 'StrongPass123!', otpCode: '000000' });
  const uploaderRegister = await registerUser({
    email: 'uploader@example.com',
    username: 'uploader',
    password: 'StrongPass123!',
    otpCode: '000000',
  });

  prismaMock.setUserRole('admin@example.com', 'ADMIN');

  let login429 = 0;
  for (let i = 0; i < 4; i += 1) {
    const csrf = await issueCsrfCookie();
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: {
        origin: 'http://frontend.local:3000',
        'content-type': 'application/json',
        cookie: csrf.cookiePair,
        'x-csrf-token': csrf.token,
      },
      body: JSON.stringify({ email: 'admin@example.com', password: 'wrong-password' }),
    });
    if (res.status === 429) {
      login429 = res.status;
      break;
    }
  }

  if (login429 !== 429) {
    throw new Error(`login rate limit check failed, expected 429 got ${login429 || 'not-hit'}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 1600));

  const authCookie = uploaderRegister.authCookie;

  let upload429 = 0;
  for (let i = 0; i < 12; i += 1) {
    const csrf = await issueCsrfCookie(authCookie);
    const form = new FormData();
    form.set('title', `Upload-${i}`);
    form.set('visibility', 'PUBLIC');
    form.set('file', new Blob([`hello-${i}`], { type: 'text/plain' }), `demo-${i}.txt`);

    const res = await fetch(`${base}/materials`, {
      method: 'POST',
      headers: {
        origin: 'http://frontend.local:3000',
        cookie: `${authCookie}; ${csrf.cookiePair}`,
        'x-csrf-token': csrf.token,
      },
      body: form,
    });

    if (res.status === 429) {
      upload429 = res.status;
      break;
    }
  }

  if (upload429 !== 429) {
    throw new Error(`upload rate limit check failed, expected 429 got ${upload429 || 'not-hit'}`);
  }

  const authService = app.get(AuthService) as AuthService & {
    issueAccessToken: (
      user: { id: string; email: string; username: string; role: UserRole },
      tokenVersion: number,
    ) => string;
  };
  const adminUser = prismaMock.findUserByEmail('admin@example.com');
  if (!adminUser) {
    throw new Error('admin user not found');
  }
  const adminAccessToken = authService.issueAccessToken(
    {
      id: adminUser.id,
      email: adminUser.email,
      username: adminUser.username,
      role: 'ADMIN',
    },
    adminUser.tokenVersion,
  );
  const adminCookie = `auth-token=${adminAccessToken}`;

  let admin429 = 0;
  for (let i = 0; i < 35; i += 1) {
    const res = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
      headers: { cookie: adminCookie },
    });

    if (res.status === 429) {
      admin429 = res.status;
      break;
    }
  }

  if (admin429 !== 429) {
    throw new Error(`admin rate limit check failed, expected 429 got ${admin429 || 'not-hit'}`);
  }

  assertBlockedLog(capturedLogs, {
    rule: 'auth-login-ip-email',
    altRule: 'auth-login-lock',
    route: '/auth/login',
    method: 'POST',
    hint: 'login',
  });
  assertBlockedLog(capturedLogs, {
    rule: 'materials-upload',
    route: '/materials',
    method: 'POST',
    hint: 'upload',
  });
  assertBlockedLog(capturedLogs, {
    rule: 'admin-strict',
    route: '/admin/materials/pending',
    method: 'GET',
    hint: 'admin',
  });

  console.log('login 429 check passed:', login429);
  console.log('upload 429 check passed:', upload429);
  console.log('admin 429 check passed:', admin429);
  console.log('rate_limit_blocked log assertion passed: login/upload/admin');
  console.log('evidence marker: {"event":"rate_limit_blocked"}');

  await app.close();
}

function parseRateLimitLog(message: string): RateLimitLogEvent | null {
  try {
    const parsed = JSON.parse(message) as RateLimitLogEvent;
    if (parsed.event === 'rate_limit_blocked' || parsed.event === 'rate_limit_metric') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function assertBlockedLog(
  logs: RateLimitLogEvent[],
  expected: { rule: string; altRule?: string; route: string; method: string; hint: string },
): void {
  const found = logs.find(
    (item) =>
      item.event === 'rate_limit_blocked' &&
      (item.rule === expected.rule || (expected.altRule !== undefined && item.rule === expected.altRule)) &&
      item.route === expected.route &&
      item.method === expected.method,
  );

  if (!found) {
    const blockedLogs = logs.filter((item) => item.event === 'rate_limit_blocked');
    const ruleDesc = expected.altRule !== undefined ? `${expected.rule}|${expected.altRule}` : expected.rule;
    throw new Error(
      `${expected.hint} rate_limit_blocked log assert failed, expected ${expected.method} ${expected.route} / ${ruleDesc}, got=${JSON.stringify(
        blockedLogs,
      )}`,
    );
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
