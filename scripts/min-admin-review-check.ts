/// <reference path="../src/types/express.d.ts" />
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { MinioService, PrismaService } from '../src/infra';
import { matchesUserWhere } from './support/user-where-match';

type UserRole = 'USER' | 'ADMIN';
type MaterialStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'OFFLINE';

type DbUser = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
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
  private auditLogs: unknown[] = [];

  user = {
    findFirst: async ({ where }: { where: unknown }) => {
      return this.users.find((user) => matchesUserWhere(user, where)) ?? null;
    },
    create: async ({
      data,
      select,
    }: {
      data: { email: string; username: string; passwordHash: string; role: UserRole };
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
      const filtered = this.materials.filter((m) => m.status === where.status);
      const ordered = [...filtered].sort((a, b) =>
        orderBy.createdAt === 'desc'
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime(),
      );
      return ordered.slice(skip, skip + take).map((m) => this.pick(m, select));
    },

    count: async ({ where }: { where: { status: MaterialStatus } }) => {
      return this.materials.filter((m) => m.status === where.status).length;
    },

    findUnique: async ({ where, select }: { where: { id: string }; select: Record<string, boolean> }) => {
      const material = this.materials.find((m) => m.id === where.id);
      return material ? this.pick(material, select) : null;
    },

    update: async ({
      where,
      data,
      select,
    }: {
      where: { id: string };
      data: { status: MaterialStatus; reviewComment?: string };
      select: Record<string, boolean>;
    }) => {
      const material = this.materials.find((m) => m.id === where.id);
      if (!material) {
        throw new Error('not found');
      }
      material.status = data.status;
material.reviewComment = data.reviewComment ?? null;
      material.updatedAt = new Date();
      return this.pick(material, select);
    },
  };

  adminAuditLog = {
    create: async ({ data }: { data: unknown }) => {
      this.auditLogs.push(data);
      return data;
    },
    findMany: async () => this.auditLogs,
    count: async () => this.auditLogs.length,
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }

  setUserRole(email: string, role: UserRole): void {
    const user = this.users.find((u) => u.email === email);
    if (user) {
      user.role = role;
    }
  }

  debugMaterialById(id: string): DbMaterial | null {
    return this.materials.find((m) => m.id === id) ?? null;
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
  async uploadObject(key: string): Promise<string> {
    return `study-connect/${key}`;
  }
}

function readCookiePair(setCookieHeader: string | null, cookieName: string): string {
  if (!setCookieHeader) return '';
  const segment = setCookieHeader
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieName}=`));
  return segment ? (segment.split(';')[0] ?? '') : '';
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = 'task4-secret';
  // Match the other 8 min-* scripts: bypass real OTP verification so register/
  // login succeed against the mock Prisma (which has no otpAttempt table).
  process.env.AUTH_OTP_TEST_BYPASS = process.env.AUTH_OTP_TEST_BYPASS ?? 'true';
  // State-changing routes go through CsrfGuard, which requires an allow-listed
  // Origin + a matching CSRF cookie/header. Set the allow-list and send those on
  // every POST below (this test predates CSRF enforcement).
  process.env.CORS_ORIGIN = 'http://frontend.local:3000';
  process.env.MAX_UPLOAD_SIZE_MB = '50';

  const prismaMock = new PrismaServiceMock();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(MinioService)
    .useValue(new MinioServiceMock())
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();
  await app.listen(0);

  const address = app.getHttpServer().address();
  const port = typeof address === 'string' ? 3000 : address.port;
  const base = `http://127.0.0.1:${port}`;
  const ORIGIN = 'http://frontend.local:3000';

  async function issueCsrfCookie(existingCookies = ''): Promise<{ token: string; cookiePair: string }> {
    const res = await fetch(`${base}/auth/csrf`, {
      headers: { origin: ORIGIN, ...(existingCookies ? { cookie: existingCookies } : {}) },
    });
    const body = (await res.json()) as { csrfToken: string };
    return { token: body.csrfToken, cookiePair: readCookiePair(res.headers.get('set-cookie'), 'csrf-token') };
  }

  async function registerUser(input: { email: string; username: string; password: string }): Promise<void> {
    const csrf = await issueCsrfCookie();
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/json',
        cookie: csrf.cookiePair,
        'x-csrf-token': csrf.token,
      },
      body: JSON.stringify({ ...input, otpCode: '000000' }),
    });
    if (res.status !== 201) {
      throw new Error(`register ${input.email} failed, status=${res.status}, body=${await res.text()}`);
    }
  }

  async function loginUser(email: string, password: string): Promise<string> {
    const csrf = await issueCsrfCookie();
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/json',
        cookie: csrf.cookiePair,
        'x-csrf-token': csrf.token,
      },
      body: JSON.stringify({ email, password }),
    });
    if (res.status !== 200) {
      throw new Error(`login ${email} failed, status=${res.status}, body=${await res.text()}`);
    }
    return ((await res.json()) as { accessToken: string }).accessToken;
  }

  // register user + admin
  await registerUser({ email: 'user@example.com', username: 'user1', password: 'StrongPass123!' });
  await registerUser({ email: 'admin@example.com', username: 'admin1', password: 'StrongPass123!' });

  prismaMock.setUserRole('admin@example.com', 'ADMIN');

  const userToken = await loginUser('user@example.com', 'StrongPass123!');
  const adminToken = await loginUser('admin@example.com', 'StrongPass123!');

  const forbiddenRes = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
    headers: { authorization: `Bearer ${userToken}` },
  });
  console.log('user pending list status:', forbiddenRes.status);
  // An authenticated USER hitting an ADMIN route is a role failure -> 403
  // (per docs/error-code-spec.md). The previous 401 only "passed" because the
  // OTP-less register failed and the token was undefined.
  if (forbiddenRes.status !== 403) {
    process.exitCode = 1;
    throw new Error(`expected user pending list status 403, got ${forbiddenRes.status}`);
  }

  async function uploadOne(title: string): Promise<string> {
    const csrf = await issueCsrfCookie(`auth-token=${userToken}`);
    const form = new FormData();
    form.set('title', title);
    form.set('description', `${title} description`);
    form.set('visibility', 'PUBLIC');
    form.set('file', new Blob(['data'], { type: 'text/plain' }), `${title}.txt`);

    const res = await fetch(`${base}/materials`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${userToken}`,
        cookie: csrf.cookiePair,
        'x-csrf-token': csrf.token,
      },
      body: form,
    });
    if (res.status !== 201) {
      throw new Error(`upload ${title} failed, status=${res.status}, body=${await res.text()}`);
    }
    const body = (await res.json()) as { id: string };
    return body.id;
  }

  // POST admin actions go through CsrfGuard too — issue a token per call.
  async function adminPost(path: string, payload?: Record<string, unknown>): Promise<Response> {
    const csrf = await issueCsrfCookie(`auth-token=${adminToken}`);
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        authorization: `Bearer ${adminToken}`,
        cookie: csrf.cookiePair,
        'x-csrf-token': csrf.token,
        ...(payload ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
  }

  const materialApproveId = await uploadOne('to-approve');
  const materialRejectId = await uploadOne('to-reject');

  const pendingRes = await fetch(`${base}/admin/materials/pending?page=1&pageSize=10`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const pendingText = await pendingRes.text();
  console.log('admin pending list status:', pendingRes.status);
  console.log('admin pending list body:', pendingText);
  if (pendingRes.status !== 200) {
    process.exitCode = 1;
    throw new Error(`expected admin pending list status 200, got ${pendingRes.status}`);
  }

  // These admin actions are @Post with no @HttpCode, so Nest returns 201.
  const approveRes = await adminPost(`/admin/materials/${materialApproveId}/approve`);
  const approveText = await approveRes.text();
  console.log('approve status:', approveRes.status);
  console.log('approve body:', approveText);
  if (approveRes.status !== 201) {
    process.exitCode = 1;
    throw new Error(`expected approve status 201, got ${approveRes.status}`);
  }

  const rejectRes = await adminPost(`/admin/materials/${materialRejectId}/reject`, { reason: 'Spam content' });
  const rejectText = await rejectRes.text();
  console.log('reject status:', rejectRes.status);
  console.log('reject body:', rejectText);
  if (rejectRes.status !== 201) {
    process.exitCode = 1;
    throw new Error(`expected reject status 201, got ${rejectRes.status}`);
  }


  const offlineRes = await adminPost(`/admin/materials/${materialApproveId}/offline`, { reviewComment: 'Taken down by admin' });
  const offlineText = await offlineRes.text();
  console.log('offline status:', offlineRes.status);
  console.log('offline body:', offlineText);
  if (offlineRes.status !== 201) {
    process.exitCode = 1;
    throw new Error(`expected offline status 201, got ${offlineRes.status}`);
  }

  console.log('db offlined material:', JSON.stringify(prismaMock.debugMaterialById(materialApproveId)));
  console.log('db rejected material:', JSON.stringify(prismaMock.debugMaterialById(materialRejectId)));

  await app.close();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
